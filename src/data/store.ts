import { useSyncExternalStore } from 'react';
import { computePrice, needsReview, providerFee } from '../lib/pricing';
import type { Card, Cents, ChannelKey, DB, Member, PayMethod, Sale, SaleChannel, StockItem, Tag } from '../lib/types';
import { buildDemo } from './demo';

const KEY = 'restockd-app-v1';

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === 3) return parsed;
    }
  } catch { /* storage blocked: fall back to demo data */ }
  return buildDemo();
}

let db: DB = load();
const listeners = new Set<() => void>();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } }
function commit(next: DB) { db = next; persist(); listeners.forEach((l) => l()); }
/** Applies a change to a copy of the database and saves it. */
export function update(fn: (d: DB) => void) { const next = structuredClone(db); fn(next); commit(next); }
export const getDB = () => db;
export function useDB(): DB {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => db);
}
export function resetDemo() { commit(buildDemo()); }
/** For tests: replace the database. */
export function _setDB(d: DB) { db = d; }

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

/* ---------- Lookups ---------- */
export const cardOf = (d: DB, item: Pick<StockItem, 'cardId'>): Card => d.cards.find((c) => c.id === item.cardId)!;
export const itemName = (d: DB, item: StockItem) => cardOf(d, item).name;
export const tagOfItem = (d: DB, itemId: string) => d.tags.find((t) => t.itemId === itemId && t.status === 'active');
export const me = (d: DB): Member => d.members.find((m) => m.id === d.settings.currentMemberId) ?? d.members[0];
export const isOwner = (d: DB) => me(d).role === 'owner';
export const vendorName = (d: DB, id: string) => (id === d.settings.vendor.id ? d.settings.vendor.name : d.vendors.find((v) => v.id === id)?.name ?? 'another vendor');
export const saleName = (d: DB, s: Sale) => { const it = d.items.find((i) => i.id === s.itemId); return it ? itemName(d, it) : s.label ?? 'Archived item'; };
export const nextShow = (d: DB) => d.shows.filter((s) => s.attending && new Date(s.date) >= startOfToday()).sort((a, b) => a.date.localeCompare(b.date))[0];
export function startOfToday() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }

/* ---------- Pricing ---------- */
export interface PriceChange { item: StockItem; card: Card; from: Cents; to: Cents; review: boolean; decidedBy: string }
export function priceChanges(d: DB): PriceChange[] {
  const out: PriceChange[] = [];
  for (const item of d.items) {
    if (item.status === 'sold' || item.manualPrice != null) continue;
    const card = cardOf(d, item);
    const r = computePrice(item, card, d.settings.rules, 'show');
    if (r.price !== item.price) out.push({ item, card, from: item.price, to: r.price, review: needsReview(item.price, r.price, d.settings.rules), decidedBy: r.decidedBy });
  }
  return out;
}
/** The nightly update: small changes go through, big ones wait for the vendor. */
export function runNightlyUpdate() {
  const changes = priceChanges(db).filter((c) => !c.review);
  update((d) => { for (const c of changes) { const it = d.items.find((i) => i.id === c.item.id)!; it.price = c.to; } });
  return changes.length;
}
export function approvePrices(ids: string[]) {
  const map = new Map(priceChanges(db).map((c) => [c.item.id, c.to]));
  update((d) => { for (const id of ids) { const it = d.items.find((i) => i.id === id); const to = map.get(id); if (it && to != null) it.price = to; } });
}
export function setManualPrice(itemId: string, cents: Cents | undefined) {
  update((d) => {
    const it = d.items.find((i) => i.id === itemId)!;
    it.manualPrice = cents;
    it.price = cents ?? computePrice({ ...it, manualPrice: undefined }, cardOf(d, it), d.settings.rules, 'show').price;
  });
}
export function updateRules(patch: Partial<DB['settings']['rules']>) { update((d) => { d.settings.rules = { ...d.settings.rules, ...patch }; }); }

/* ---------- Stock ---------- */
export interface NewItem { cardId: string; condition: StockItem['condition']; language: StockItem['language']; cost: Cents; location: string; grader?: StockItem['grader']; grade?: string; cert?: string; consignorId?: string }
export function addItem(n: NewItem): StockItem {
  const cert = n.cert?.trim();
  if (cert) {
    const stolen = db.stolen.find((r) => r.cert === cert && r.status === 'active');
    if (stolen && !stolen.mine) {
      update((d) => {
        const r = d.stolen.find((x) => x.id === stolen.id)!;
        r.hits.push({ at: nowIso(), where: `Intake attempt by ${d.settings.vendor.name}` });
      });
      throw new Error(`Stop: certificate ${cert} is reported stolen. Do not buy or list this slab. The owner has been notified.`);
    }
    if (db.otherCerts.includes(cert)) throw new Error(`Certificate ${cert} is already in another vendor's inventory. A slab can only be in one inventory at a time.`);
    if (db.items.some((i) => i.cert === cert && i.status !== 'sold')) throw new Error(`Certificate ${cert} is already in your stock.`);
  }
  const item: StockItem = {
    id: uid('i'), cardId: n.cardId, condition: n.condition, language: n.language, cost: n.cost, price: 0, location: n.location,
    grader: n.grader, grade: n.grade, cert, consignorId: n.consignorId,
    channels: { ebay: false, marktplaats: false, shop: true }, status: 'in_stock', maxDiscountPct: 10, scans: 0, addedAt: nowIso(),
  };
  item.price = computePrice(item, cardOf(db, item), db.settings.rules, 'show').price;
  update((d) => { d.items.unshift(item); });
  return item;
}
export function toggleChannel(itemId: string, ch: ChannelKey) { update((d) => { const it = d.items.find((i) => i.id === itemId)!; it.channels[ch] = !it.channels[ch]; }); }
export function setMaxDiscount(itemId: string, pct: number) { update((d) => { d.items.find((i) => i.id === itemId)!.maxDiscountPct = Math.max(0, Math.min(50, pct)); }); }
export function setLocation(itemId: string, location: string) { update((d) => { d.items.find((i) => i.id === itemId)!.location = location; }); }

/* ---------- Tags ---------- */
export type TapResult =
  | { type: 'unknown'; code: string }
  | { type: 'other'; tag: Tag; owner: string }
  | { type: 'activate'; tag: Tag }
  | { type: 'lost'; tag: Tag }
  | { type: 'given'; tag: Tag }
  | { type: 'link'; tag: Tag; previous?: StockItem }
  | { type: 'linked'; tag: Tag; item?: StockItem };

/** What happens when the vendor taps a tag with the vendor app. Reads the chip, never changes it. */
export function tapTag(code: string): TapResult {
  const id = code.trim().toUpperCase();
  const tag = db.tags.find((t) => t.id === id);
  if (!tag || !tag.locked) return { type: 'unknown', code: id };
  if (tag.ownerId !== db.settings.vendor.id) {
    logTag(tag.id, `Scanned by ${db.settings.vendor.name} (not the owner)`);
    return { type: 'other', tag, owner: vendorName(db, tag.ownerId) };
  }
  if (tag.status === 'shipped' || tag.status === 'stock') return { type: 'activate', tag };
  if (tag.status === 'lost') return { type: 'lost', tag };
  if (tag.status === 'given') return { type: 'given', tag };
  if (tag.status === 'free') {
    const last = [...tag.history].reverse().find((h) => h.text.startsWith('Sold'));
    const prev = last ? db.items.find((i) => last.text.includes(i.id)) : undefined;
    return { type: 'link', tag, previous: prev };
  }
  return { type: 'linked', tag, item: tag.itemId ? db.items.find((i) => i.id === tag.itemId) : undefined };
}
function logTag(id: string, text: string) { update((d) => { d.tags.find((t) => t.id === id)?.history.push({ at: nowIso(), text }); }); }
export function activateTag(id: string) { update((d) => { const t = d.tags.find((x) => x.id === id)!; t.status = 'free'; t.history.push({ at: nowIso(), text: 'Activated on your account' }); }); }
export function linkTag(id: string, target: { itemId?: string; location?: string }) {
  const t0 = db.tags.find((x) => x.id === id);
  if (!t0 || t0.ownerId !== db.settings.vendor.id) throw new Error('This tag belongs to another account.');
  if (t0.status === 'lost' || t0.status === 'given') throw new Error('Mark the tag as found first.');
  if (target.itemId) {
    const it = db.items.find((i) => i.id === target.itemId);
    if (!it || it.status !== 'in_stock') throw new Error('Only items in stock can get a tag.');
  }
  update((d) => {
    const t = d.tags.find((x) => x.id === id)!;
    if (target.itemId) {
      d.tags.filter((x) => x.itemId === target.itemId && x.id !== id).forEach((x) => { x.itemId = undefined; x.status = 'free'; x.history.push({ at: nowIso(), text: 'Unlinked (card got another tag)' }); });
      t.itemId = target.itemId; t.location = undefined;
      t.history.push({ at: nowIso(), text: `Linked to ${itemName(d, d.items.find((i) => i.id === target.itemId)!)}` });
    } else {
      t.itemId = undefined; t.location = target.location;
      t.history.push({ at: nowIso(), text: `Linked to ${target.location}` });
    }
    t.status = 'active';
  });
}
export function unlinkTag(id: string) { update((d) => { const t = d.tags.find((x) => x.id === id)!; t.itemId = undefined; t.location = undefined; t.status = 'free'; t.history.push({ at: nowIso(), text: 'Unlinked by hand' }); }); }
export function setTagStatus(id: string, status: 'lost' | 'given' | 'free') {
  const text = { lost: 'Marked as lost: every scan now alerts you', given: 'Went with the buyer (shows a sale receipt)', free: 'Marked as found' }[status];
  update((d) => { const t = d.tags.find((x) => x.id === id)!; t.status = status; if (status !== 'free') { t.itemId = undefined; t.location = undefined; } t.history.push({ at: nowIso(), text }); });
}

/** A buyer opens the tag page. Counts the scan and alerts the owner for lost tags. */
export function buyerScan(id: string) {
  const t = db.tags.find((x) => x.id === id.toUpperCase());
  if (!t) return;
  update((d) => {
    const tag = d.tags.find((x) => x.id === t.id)!;
    tag.scans += 1;
    if (tag.itemId) { const it = d.items.find((i) => i.id === tag.itemId); if (it) it.scans += 1; }
    if (tag.status === 'lost' && tag.ownerId === d.settings.vendor.id) {
      d.notices.unshift({ id: uid('no'), at: nowIso(), kind: 'lost', text: `Your lost tag ${tag.id} was just scanned. The scan time is saved in the tag history.` });
      tag.history.push({ at: nowIso(), text: 'Scanned while marked as lost' });
    }
  });
}

/* ---------- Selling ---------- */
export interface SellInput { itemId: string; price: Cents; discount?: Cents; method: PayMethod; channel: SaleChannel; showId?: string; buyerTookTag?: boolean }
export function sell(input: SellInput): Sale {
  const it0 = db.items.find((i) => i.id === input.itemId);
  if (!it0) throw new Error('Item not found.');
  if (it0.status === 'sold') throw new Error('This item is already sold.');
  const viaWallet = input.method !== 'cash' && input.method !== 'tikkie' && input.method !== 'external';
  const amount = input.price - (input.discount ?? 0);
  const fee = viaWallet ? providerFee(input.method, amount) : 0;
  const commission = viaWallet ? Math.round((amount * db.settings.commissionPct) / 100) : 0;
  const cons = it0.consignorId ? db.consignors.find((c) => c.id === it0.consignorId) : undefined;
  const sale: Sale = {
    id: uid('s'), at: nowIso(), itemId: it0.id, price: amount, discount: input.discount ?? 0, method: input.method, channel: input.channel,
    showId: input.showId, soldBy: db.settings.currentMemberId, fee, commission, viaWallet,
    consignorShare: cons ? Math.round(((amount - fee - commission) * cons.ownerSharePct) / 100) : undefined,
  };
  update((d) => {
    d.sales.push(sale);
    const it = d.items.find((i) => i.id === it0.id)!;
    it.status = 'sold'; it.reservedUntil = undefined;
    it.channels = { ebay: false, marktplaats: false, shop: false };
    const t = d.tags.find((x) => x.itemId === it.id);
    if (t) {
      t.itemId = undefined;
      t.status = input.buyerTookTag ? 'given' : 'free';
      t.history.push({ at: nowIso(), text: `Sold ${it.id} for ${(amount / 100).toFixed(2)} via ${input.channel}${input.buyerTookTag ? ' (tag went with the buyer)' : ''}` });
    }
  });
  return sale;
}
export function reserve(itemId: string, minutes = 15) {
  update((d) => { const it = d.items.find((i) => i.id === itemId)!; it.status = 'reserved'; it.reservedUntil = new Date(Date.now() + minutes * 60000).toISOString(); });
}
export function releaseReservation(itemId: string) { update((d) => { const it = d.items.find((i) => i.id === itemId)!; if (it.status === 'reserved') { it.status = 'in_stock'; it.reservedUntil = undefined; } }); }

/* ---------- Shows ---------- */
export function setAttending(showId: string, attending: boolean, booth?: string) { update((d) => { const s = d.shows.find((x) => x.id === showId)!; s.attending = attending; s.booth = attending ? booth || s.booth : undefined; }); }
export function makeShowReady(showId: string, bringing: string[]) {
  const pending = priceChanges(db).filter((c) => !c.review);
  update((d) => {
    for (const c of pending) d.items.find((i) => i.id === c.item.id)!.price = c.to;
    const s = d.shows.find((x) => x.id === showId)!;
    s.frozen = true; s.bringing = bringing;
    for (const it of d.items) if (it.status !== 'sold' && bringing.includes(it.location)) it.pausedOnline = true;
  });
  return pending.length;
}
export function endShow(showId: string) {
  update((d) => { const s = d.shows.find((x) => x.id === showId)!; s.frozen = false; s.bringing = []; for (const it of d.items) it.pausedOnline = false; });
}

/* ---------- Wallet ---------- */
const HOLD_DAYS = 2;
export function walletSummary(d: DB) {
  const cutoff = Date.now() - HOLD_DAYS * 86400000;
  let available = 0, pending = 0, fees = 0, commission = 0, elsewhere = 0, owedConsignors = 0;
  for (const s of d.sales) {
    if (!s.viaWallet) { if (s.method === 'external') elsewhere += s.price; continue; }
    const net = s.price - s.fee - s.commission;
    fees += s.fee; commission += s.commission;
    if (new Date(s.at).getTime() < cutoff) available += net; else pending += net;
  }
  for (const c of d.consignors) owedConsignors += consignorOwed(d, c.id);
  const paid = d.payouts.filter((p) => p.status === 'paid').reduce((a, p) => a + p.amount, 0);
  return { available: Math.max(0, available - paid), pending, fees, commission, elsewhere, paid, owedConsignors };
}
export function payoutNow() {
  const { available } = walletSummary(db);
  if (available <= 0) throw new Error('There is nothing available to pay out yet.');
  update((d) => { d.payouts.push({ id: uid('p'), at: nowIso(), amount: available, status: 'paid' }); });
  return available;
}
export function setPayoutSchedule(s: DB['settings']['payoutSchedule']) { update((d) => { d.settings.payoutSchedule = s; }); }

/* ---------- Consignment ---------- */
export function consignorOwed(d: DB, id: string) {
  const c = d.consignors.find((x) => x.id === id)!;
  const total = d.sales.filter((s) => d.items.find((i) => i.id === s.itemId)?.consignorId === id).reduce((a, s) => a + (s.consignorShare ?? 0), 0);
  return Math.max(0, total - c.paidOut);
}
export function payConsignor(id: string) { const owed = consignorOwed(db, id); update((d) => { d.consignors.find((x) => x.id === id)!.paidOut += owed; }); return owed; }
export function addConsignor(name: string, pct: number) { update((d) => { d.consignors.push({ id: uid('k'), name, ownerSharePct: pct, paidOut: 0 }); }); }

/* ---------- Stolen registry ---------- */
export function reportStolen(r: { grader: string; cert: string; cardName: string; policeRef: string }) {
  if (!r.policeRef.trim()) throw new Error('A police report number is required. It prevents false reports.');
  if (db.stolen.some((x) => x.cert === r.cert.trim() && x.status === 'active')) throw new Error('This certificate is already reported.');
  update((d) => { d.stolen.unshift({ id: uid('r'), grader: r.grader, cert: r.cert.trim(), cardName: r.cardName.trim(), policeRef: r.policeRef.trim(), reportedAt: nowIso(), mine: true, status: 'active', hits: [] }); });
}
export function resolveStolen(id: string) { update((d) => { d.stolen.find((x) => x.id === id)!.status = 'resolved'; }); }
export function checkCert(cert: string) {
  const c = cert.trim();
  const r = db.stolen.find((x) => x.cert === c && x.status === 'active');
  if (r) update((d) => { d.stolen.find((x) => x.id === r.id)!.hits.push({ at: nowIso(), where: 'Checked on the public check page' }); });
  return r ? { stolen: true as const, report: r } : { stolen: false as const };
}

/* ---------- Misc ---------- */
export function markNoticesRead() { update((d) => { d.notices.forEach((n) => { n.read = true; }); }); }
export function switchMember(id: string) { update((d) => { d.settings.currentMemberId = id; }); }
export function setVendorName(name: string) { update((d) => { d.settings.vendor.name = name; }); }
