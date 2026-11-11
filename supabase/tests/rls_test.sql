-- Run after 00_local_stub.sql and the migration. Every check raises if the rule is broken.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Seed as the database owner (bypasses RLS like the service role would).
insert into vendors(id, name) values ('00000000-0000-0000-0000-00000000000a', 'Restockd'), ('00000000-0000-0000-0000-00000000000b', 'Kaartenhoek');
insert into vendor_members values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner', 'Jeraiya'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'helper', 'Lisa'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'owner', 'Jesse');
insert into cards(id, game, name, kind, market_trend) values ('00000000-0000-0000-0000-0000000000c1', 'Pokémon', 'Charizard ex', 'single', 9980),
  ('00000000-0000-0000-0000-0000000000c2', 'Pokémon', 'Charizard (PSA 10)', 'graded', 61000);
insert into tags(id, chip, status, owner_vendor_id, order_id) values ('04A3F2B1', 'NTAG213', 'shipped', '00000000-0000-0000-0000-00000000000a', '1042');

create function as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
grant execute on function as_user(text) to authenticated, anon;

-- 1. Owner A adds stock and sells; helper A sells too.
set role authenticated; select as_user('00000000-0000-0000-0000-0000000000a1');
insert into items(id, vendor_id, card_id, cost, price) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 6000, 9500);
insert into items(id, vendor_id, card_id, cost, price, grader, grade, cert) values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c2', 42000, 58000, 'PSA', '10', '84721956');
insert into sales(vendor_id, price, method, channel, sold_by, via_wallet) values ('00000000-0000-0000-0000-00000000000a', 9500, 'tap', 'booth', '00000000-0000-0000-0000-0000000000a1', true);
select as_user('00000000-0000-0000-0000-0000000000a2');
insert into sales(vendor_id, price, method, channel, sold_by, via_wallet) values ('00000000-0000-0000-0000-00000000000a', 2500, 'cash', 'booth', '00000000-0000-0000-0000-0000000000a2', false);

-- 2. Helper A: sees stock and only their own sale, never the cost.
do $$ begin
  if (select count(*) from items) <> 2 then raise exception 'helper should see 2 items'; end if;
  if (select count(*) from sales) <> 1 then raise exception 'helper should only see own sale'; end if;
  if (select count(*) from items_with_cost) <> 0 then raise exception 'helper must not see cost'; end if;
  begin perform cost from items; raise exception 'helper could read cost column';
  exception when insufficient_privilege then null; end;
  if (select count(*) from payouts) <> 0 then raise exception 'payouts visible to helper'; end if;
end $$;

-- 3. Owner A sees both sales and cost.
select as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select count(*) from sales) <> 2 then raise exception 'owner should see 2 sales'; end if;
  if (select cost from items_with_cost where id = '00000000-0000-0000-0000-0000000000e1') <> 6000 then raise exception 'owner should see cost'; end if;
end $$;

-- 4. Vendor B sees nothing of A, cannot take A's tag, cannot add the same slab.
select as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  if (select count(*) from items) <> 0 then raise exception 'B sees A items'; end if;
  if (select count(*) from sales) <> 0 then raise exception 'B sees A sales'; end if;
  if (select count(*) from tags) <> 0 then raise exception 'B sees A tags'; end if;
  if claim_tag('04A3F2B1', '00000000-0000-0000-0000-00000000000b') <> 'other_vendor' then raise exception 'B could claim A tag'; end if;
  if intake_check('84721956', '00000000-0000-0000-0000-00000000000b') <> 'in_other_inventory' then raise exception 'one-inventory check failed'; end if;
  begin
    insert into items(vendor_id, card_id, cert) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000c2', '84721956');
    raise exception 'same cert allowed in two inventories';
  exception when unique_violation then null; end;
end $$;

-- 5. A claims its own tag.
select as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin if claim_tag('04A3F2B1', '00000000-0000-0000-0000-00000000000a') <> 'activated' then raise exception 'claim failed'; end if; end $$;

-- 6. Stolen registry: B reports a cert. In review nothing is flagged; after approval it is.
select as_user('00000000-0000-0000-0000-0000000000b1');
insert into stolen_reports(reporter_user_id, grader, cert, card_name, police_ref, proof) values ('00000000-0000-0000-0000-0000000000b1', 'PSA', '61234987', 'Charizard Base (PSA 8)', 'NL-2026-1', 'invoice');
do $$ begin
  begin
    insert into stolen_reports(reporter_user_id, grader, cert, card_name, police_ref, proof, status) values ('00000000-0000-0000-0000-0000000000b1', 'PSA', '1', 'x', 'NL-2026-2', 'invoice', 'active');
    raise exception 'user could create an active report directly';
  exception when insufficient_privilege then null; end;
  if check_cert('61234987') then raise exception 'cert flagged while in review'; end if;
end $$;
reset role;
update stolen_reports set status = 'active' where cert = '61234987';   -- the Restockd team approves
set role authenticated; select as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if intake_check('61234987', '00000000-0000-0000-0000-00000000000a') <> 'stolen' then raise exception 'intake did not detect stolen'; end if;
  begin
    insert into items(vendor_id, card_id, cert) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c2', '61234987');
    raise exception 'stolen cert was stored';
  exception when raise_exception then
    if sqlerrm not like '%reported stolen%' then raise; end if;
  end;
  if (select count(*) from stolen_reports) <> 0 then raise exception 'A can read B report'; end if;
end $$;
set role anon;
do $$ begin if not check_cert('61234987') then raise exception 'public check failed'; end if; end $$;
set role authenticated; select as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  if (select count(*) from my_stolen_hits) <> 2 then raise exception 'reporter should see 2 hits (intake + check), got %', (select count(*) from my_stolen_hits); end if;
  if (select count(*) from notices) <> 1 then raise exception 'reporter vendor should get a notice'; end if;
end $$;

-- 7. Buyer (anon) opens a tag: public fields only.
reset role;
update tags set status = 'active', item_id = '00000000-0000-0000-0000-0000000000e1' where id = '04A3F2B1';
set role anon;
do $$ declare j jsonb; begin
  j := public_tag('04a3f2b1');
  if j->>'price' <> '9500' or j->>'vendor' <> 'Restockd' then raise exception 'public tag wrong: %', j; end if;
  if j ? 'cost' then raise exception 'cost leaked'; end if;
  if (public_tag('ZZ999')->>'status') <> 'unknown' then raise exception 'fake tag accepted'; end if;
  begin perform 1 from items; raise exception 'anon could read items';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL RLS CHECKS PASSED' as result;
