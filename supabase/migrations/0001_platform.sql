-- Restockd platform schema (Supabase / PostgreSQL)
-- Multi-vendor: every row that belongs to a vendor carries vendor_id, and row level security
-- makes sure a vendor (and their helpers) only ever see their own data.
-- Money is stored as integer cents.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Vendors and members
-- ---------------------------------------------------------------------------
create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  verified boolean not null default false,
  referral_code text unique,
  created_at timestamptz not null default now()
);

create table vendor_members (
  vendor_id uuid not null references vendors(id) on delete cascade,
  user_id uuid not null,               -- auth.users.id
  role text not null check (role in ('owner', 'helper')),
  display_name text,
  primary key (vendor_id, user_id)
);

-- Helper functions used by the policies. security definer so they can read vendor_members
-- without the caller needing their own policy on it; search_path pinned for safety.
create or replace function is_member(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_members m where m.vendor_id = v and m.user_id = auth.uid());
$$;

create or replace function is_owner(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vendor_members m where m.vendor_id = v and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- ---------------------------------------------------------------------------
-- Catalogue and market prices
-- owner_vendor_id is null for the shared catalogue (filled by the nightly price import),
-- or set for cards a vendor added themselves (for example from a Restockd HQ import).
-- ---------------------------------------------------------------------------
create table cards (
  id uuid primary key default gen_random_uuid(),
  owner_vendor_id uuid references vendors(id) on delete cascade,
  game text not null,
  name text not null,
  set_name text,
  number text,
  kind text not null check (kind in ('single', 'graded', 'sealed')),
  market_trend integer not null default 0,
  market_low integer not null default 0,
  market_avg30 integer not null default 0,
  market_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table card_price_history (
  card_id uuid not null references cards(id) on delete cascade,
  day date not null,
  trend integer not null,
  primary key (card_id, day)
);

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
create table consignors (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  name text not null,
  owner_share_pct integer not null check (owner_share_pct between 0 and 100),
  paid_out integer not null default 0
);

create table items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  card_id uuid not null references cards(id),
  condition text not null default 'NM' check (condition in ('NM', 'EX', 'GD', 'LP', 'PL')),
  language text not null default 'EN',
  grader text check (grader in ('PSA', 'CGC', 'BGS', 'SGC', 'TAG')),
  grade text,
  cert text,
  cost integer not null default 0,
  price integer not null default 0,
  manual_price integer,
  location text not null default 'Unsorted',
  channels jsonb not null default '{"ebay": false, "marktplaats": false, "shop": true}',
  paused_online boolean not null default false,
  status text not null default 'in_stock' check (status in ('in_stock', 'reserved', 'sold')),
  reserved_until timestamptz,
  consignor_id uuid references consignors(id),
  max_discount_pct integer not null default 10 check (max_discount_pct between 0 and 50),
  scans integer not null default 0,
  hq_sku text,                          -- link to the product in Restockd HQ (sync)
  created_at timestamptz not null default now()
);
create index items_vendor on items(vendor_id, status);
-- A slab can only be in one inventory at a time, across all vendors.
create unique index items_one_inventory_per_cert on items(cert) where cert is not null and status <> 'sold';
-- One app item per HQ product per vendor, so the sync can never create duplicates.
create unique index items_hq_sku on items(vendor_id, hq_sku) where hq_sku is not null and status <> 'sold';

-- ---------------------------------------------------------------------------
-- NFC / QR tags
-- Tags are created at production (service role). The serial is printed and locked on the chip.
-- ---------------------------------------------------------------------------
create table tags (
  id text primary key,                  -- chip serial, part of the locked URL
  chip text not null check (chip in ('NTAG213', 'NTAG215', 'NTAG424')),
  status text not null default 'stock' check (status in ('stock', 'shipped', 'active', 'free', 'lost', 'given')),
  owner_vendor_id uuid references vendors(id),
  order_id text,
  item_id uuid references items(id) on delete set null,
  location text,
  locked boolean not null default true,
  scans integer not null default 0
);
create unique index tags_one_active_per_item on tags(item_id) where item_id is not null and status = 'active';

create table tag_events (
  id bigserial primary key,
  tag_id text not null references tags(id) on delete cascade,
  at timestamptz not null default now(),
  text text not null
);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------
create table sales (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  item_id uuid references items(id),
  label text,
  price integer not null,
  discount integer not null default 0,
  method text not null check (method in ('card', 'ideal', 'tap', 'cash', 'tikkie', 'external')),
  channel text not null check (channel in ('booth', 'tag', 'ebay', 'marktplaats', 'shop')),
  show_id uuid,
  sold_by uuid,                          -- auth.users.id of the member who sold it
  fee integer not null default 0,
  commission integer not null default 0,
  via_wallet boolean not null,
  consignor_share integer,
  synced_to_hq_at timestamptz,           -- set when the sale was written back to Restockd HQ
  at timestamptz not null default now()
);
create index sales_vendor_at on sales(vendor_id, at desc);

-- Mirror of payouts made by the payment provider (Mollie). Restockd never holds money itself.
create table payouts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  amount integer not null,
  status text not null check (status in ('scheduled', 'paid', 'failed')),
  provider_ref text,
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Card shows
-- ---------------------------------------------------------------------------
create table shows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  date date not null,
  tables integer,
  games text,
  entry text,
  booth_fee integer
);

create table show_attendance (
  show_id uuid not null references shows(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  booth text,
  frozen boolean not null default false,
  bringing text[] not null default '{}',
  primary key (show_id, vendor_id)
);

-- ---------------------------------------------------------------------------
-- Stolen registry
-- Lifecycle: review → active → resolved | rejected. Only the Restockd team (service role)
-- moves a report out of review. Who caused a hit is stored, but never shown to the reporter.
-- ---------------------------------------------------------------------------
create table stolen_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  grader text not null,
  cert text not null,
  card_name text not null,
  stolen_on date,
  stolen_where text,
  police_ref text not null check (length(trim(police_ref)) > 3),
  proof text not null check (proof in ('inventory', 'invoice', 'photo')),
  status text not null default 'review' check (status in ('review', 'active', 'resolved', 'rejected')),
  expires_at timestamptz not null default now() + interval '12 months',
  reported_at timestamptz not null default now()
);
create unique index stolen_one_open_report_per_cert on stolen_reports(cert) where status in ('review', 'active');

create table stolen_hits (
  id bigserial primary key,
  report_id uuid not null references stolen_reports(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('intake', 'check', 'scan', 'listing')),
  where_text text not null,
  actor_vendor_id uuid                   -- for the police only, not exposed to the reporter
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table notices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  kind text not null check (kind in ('stolen', 'lost', 'price', 'info')),
  text text not null,
  read boolean not null default false,
  at timestamptz not null default now()
);

-- ===========================================================================
-- Row level security
-- ===========================================================================
alter table vendors enable row level security;
alter table vendor_members enable row level security;
alter table cards enable row level security;
alter table card_price_history enable row level security;
alter table consignors enable row level security;
alter table items enable row level security;
alter table tags enable row level security;
alter table tag_events enable row level security;
alter table sales enable row level security;
alter table payouts enable row level security;
alter table shows enable row level security;
alter table show_attendance enable row level security;
alter table stolen_reports enable row level security;
alter table stolen_hits enable row level security;
alter table notices enable row level security;

create policy vendors_read on vendors for select to authenticated using (is_member(id));
create policy vendors_update on vendors for update to authenticated using (is_owner(id)) with check (is_owner(id));

create policy members_read on vendor_members for select to authenticated using (is_member(vendor_id));
create policy members_manage on vendor_members for all to authenticated using (is_owner(vendor_id)) with check (is_owner(vendor_id));

create policy cards_read on cards for select to authenticated using (owner_vendor_id is null or is_member(owner_vendor_id));
create policy cards_own_write on cards for insert to authenticated with check (owner_vendor_id is not null and is_member(owner_vendor_id));
create policy cards_own_update on cards for update to authenticated using (owner_vendor_id is not null and is_member(owner_vendor_id));
create policy price_history_read on card_price_history for select to authenticated using (true);

create policy consignors_owner on consignors for all to authenticated using (is_owner(vendor_id)) with check (is_owner(vendor_id));

create policy items_read on items for select to authenticated using (is_member(vendor_id));
create policy items_insert on items for insert to authenticated with check (is_member(vendor_id));
create policy items_update on items for update to authenticated using (is_member(vendor_id)) with check (is_member(vendor_id));
create policy items_delete on items for delete to authenticated using (is_owner(vendor_id));

create policy tags_read on tags for select to authenticated using (owner_vendor_id is not null and is_member(owner_vendor_id));
create policy tags_update on tags for update to authenticated using (owner_vendor_id is not null and is_member(owner_vendor_id))
  with check (owner_vendor_id is not null and is_member(owner_vendor_id));
create policy tag_events_read on tag_events for select to authenticated
  using (exists (select 1 from tags t where t.id = tag_id and t.owner_vendor_id is not null and is_member(t.owner_vendor_id)));

-- Owners see all sales; booth helpers only their own.
create policy sales_read on sales for select to authenticated using (is_owner(vendor_id) or (is_member(vendor_id) and sold_by = auth.uid()));
create policy sales_insert on sales for insert to authenticated with check (is_member(vendor_id) and sold_by = auth.uid());

create policy payouts_owner on payouts for select to authenticated using (is_owner(vendor_id));

create policy shows_read on shows for select using (true);
create policy attendance_read on show_attendance for select using (true);
create policy attendance_write on show_attendance for all to authenticated using (is_owner(vendor_id)) with check (is_owner(vendor_id));

create policy stolen_own_read on stolen_reports for select to authenticated using (reporter_user_id = auth.uid());
create policy stolen_report on stolen_reports for insert to authenticated with check (reporter_user_id = auth.uid() and status = 'review');

create policy notices_read on notices for select to authenticated using (is_member(vendor_id));
create policy notices_update on notices for update to authenticated using (is_member(vendor_id)) with check (is_member(vendor_id));

-- Hits are read through a view that leaves out actor_vendor_id.
create view my_stolen_hits with (security_invoker = false) as
  select h.id, h.report_id, h.at, h.kind, h.where_text
  from stolen_hits h join stolen_reports r on r.id = h.report_id
  where r.reporter_user_id = auth.uid();
grant select on my_stolen_hits to authenticated;

-- Helpers must not see purchase prices. The cost column is not readable for logged-in users;
-- owners read it through items_with_cost, which only returns rows of vendors they own.
revoke select on items from authenticated;
grant select (id, vendor_id, card_id, condition, language, grader, grade, cert, price, manual_price, location, channels, paused_online,
  status, reserved_until, consignor_id, max_discount_pct, scans, hq_sku, created_at) on items to authenticated;
grant insert, update, delete on items to authenticated;
create view items_with_cost with (security_invoker = false) as
  select i.id, i.vendor_id, i.cost from items i where is_owner(i.vendor_id);
grant select on items_with_cost to authenticated;

-- ===========================================================================
-- Functions that work without seeing other vendors' rows
-- ===========================================================================

-- Public check of a certificate: only says yes or no, logs a hit when it is an active report.
create or replace function check_cert(p_cert text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare r stolen_reports;
begin
  select * into r from stolen_reports where cert = trim(p_cert) and status = 'active' and expires_at > now();
  if not found then return false; end if;
  insert into stolen_hits(report_id, kind, where_text) values (r.id, 'check', 'Public check page');
  return true;
end $$;

-- What a buyer sees after tapping a tag. No login. Returns only public fields.
create or replace function public_tag(p_tag text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare t tags; i items; c cards; v vendors; flagged boolean := false;
begin
  select * into t from tags where id = upper(trim(p_tag)) and locked;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  update tags set scans = scans + 1 where id = t.id;
  if t.status = 'lost' then
    insert into notices(vendor_id, kind, text) values (t.owner_vendor_id, 'lost', 'Your lost tag ' || t.id || ' was just scanned.');
    return jsonb_build_object('status', 'lost');
  end if;
  select * into v from vendors where id = t.owner_vendor_id;
  if t.item_id is null then
    return jsonb_build_object('status', case when t.location is not null then 'location' else 'empty' end, 'vendor', v.name, 'location', t.location);
  end if;
  select * into i from items where id = t.item_id;
  select * into c from cards where id = i.card_id;
  update items set scans = scans + 1 where id = i.id;
  if i.cert is not null then
    select exists (select 1 from stolen_reports s where s.cert = i.cert and s.status = 'active') into flagged;
    if flagged then
      insert into stolen_hits(report_id, kind, where_text, actor_vendor_id)
        select s.id, 'scan', 'A buyer scanned the tag of this slab', i.vendor_id from stolen_reports s where s.cert = i.cert and s.status = 'active';
    end if;
  end if;
  return jsonb_build_object(
    'status', i.status, 'vendor', v.name, 'verified', v.verified,
    'card', jsonb_build_object('name', c.name, 'set', c.set_name, 'number', c.number, 'game', c.game, 'kind', c.kind),
    'condition', i.condition, 'language', i.language, 'grader', i.grader, 'grade', i.grade,
    'price', i.price, 'trend', c.market_trend, 'low', c.market_low, 'avg30', c.market_avg30, 'updated_at', c.market_updated_at,
    'stolen', flagged);
end $$;

-- A vendor taps a tag that was shipped to them: activate it on their account.
create or replace function claim_tag(p_tag text, p_vendor uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare t tags;
begin
  if not is_member(p_vendor) then raise exception 'Not a member of this vendor'; end if;
  select * into t from tags where id = upper(trim(p_tag)) for update;
  if not found or not t.locked then return 'unknown'; end if;
  if t.owner_vendor_id is distinct from p_vendor then return 'other_vendor'; end if;
  if t.status <> 'shipped' then return t.status; end if;
  update tags set status = 'free' where id = t.id;
  insert into tag_events(tag_id, text) values (t.id, 'Activated on your account');
  return 'activated';
end $$;

-- Step 1 of adding a slab: the app calls intake_check first. It logs the hit and answers,
-- without raising, so the hit is committed even though the slab will not be added.
create or replace function intake_check(p_cert text, p_vendor uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare r stolen_reports;
begin
  if not is_member(p_vendor) then raise exception 'Not a member of this vendor'; end if;
  select * into r from stolen_reports where cert = trim(p_cert) and status = 'active';
  if found then
    insert into stolen_hits(report_id, kind, where_text, actor_vendor_id) values (r.id, 'intake', 'Intake attempt by a vendor', p_vendor);
    insert into notices(vendor_id, kind, text)
      select m.vendor_id, 'stolen', 'Your stolen slab ' || r.grader || ' ' || r.cert || ' was offered at a vendor intake.'
      from vendor_members m where m.user_id = r.reporter_user_id and m.role = 'owner';
    return 'stolen';
  end if;
  if exists (select 1 from items where cert = trim(p_cert) and status <> 'sold') then return 'in_other_inventory'; end if;
  return 'ok';
end $$;

-- Step 2, the safety net: the database never stores an active stolen cert in stock.
create or replace function guard_stolen_cert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cert is not null and exists (select 1 from stolen_reports where cert = new.cert and status = 'active') then
    raise exception 'Certificate % is reported stolen', new.cert using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger items_guard_stolen before insert or update of cert on items for each row execute function guard_stolen_cert();

grant execute on function check_cert(text) to anon, authenticated;
grant execute on function public_tag(text) to anon, authenticated;
grant execute on function claim_tag(text, uuid) to authenticated;
grant execute on function intake_check(text, uuid) to authenticated;
revoke execute on function intake_check(text, uuid) from public;
revoke execute on function check_cert(text) from public;
revoke execute on function public_tag(text) from public;
revoke execute on function claim_tag(text, uuid) from public;
