import type { Card, DB, Game, Kind, NewsItem, Sale, Show, StockItem, Tag } from '../lib/types';
import { computePrice, providerFee } from '../lib/pricing';

/** "Today" in the demo. Everything else is relative to this. */
export const DEMO_NOW = new Date('2026-11-06T09:00:00');
const day = (n: number, h = 12) => { const d = new Date(DEMO_NOW); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };

let seed = 42;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

function history(end: number, drift: number): number[] {
  const out: number[] = [];
  let v = end / (1 + drift);
  for (let i = 0; i < 30; i++) { v = v * (1 + drift / 30) * (0.985 + rnd() * 0.03); out.push(Math.round(v)); }
  out[29] = end;
  return out;
}

function card(id: string, game: Game, name: string, set: string, number: string, trend: number, drift = 0, kind: Kind = 'single'): Card {
  const t = Math.round(trend * 100);
  return { id, game, name, set, number, kind, market: { trend: t, low: Math.round(t * 0.93), avg30: Math.round(t * (1 - drift / 2)), updatedAt: day(0, 6), history: history(t, drift) } };
}

const ARCHIVE = ['Gardevoir ex 245/198', 'Mewtwo VSTAR GG44', 'Liliana of the Veil', 'Dark Magician LOB-005', 'Roronoa Zoro OP01-025', 'Rayquaza VMAX 218/203', 'Booster bundle (sealed)', 'Snorlax 143/165', 'Mox Opal', 'Moonbreon (PSA 8)', 'Eevee IR 167/165', 'Gyarados ex 225/193']

export function buildDemo(): DB {
  seed = 42;
  const cards: Card[] = [
    card('c1', 'Pokémon', 'Charizard ex', 'Pokémon 151', '199/165', 99.8, 0.04),
    card('c2', 'Pokémon', 'Umbreon VMAX', 'Evolving Skies', '215/203', 451, 0.03),
    card('c3', 'Pokémon', 'Pikachu ex', 'Surging Sparks', '238/191', 158.4, 0.32),
    card('c4', 'Pokémon', 'Mew ex', 'Paldean Fates', '232/091', 49.9, -0.22),
    card('c5', 'Pokémon', 'Giratina V', 'Lost Origin', '186/196', 312, 0.06),
    card('c6', 'Pokémon', 'Lugia V', 'Silver Tempest', '186/195', 128, -0.04),
    card('c7', 'Magic', 'Sheoldred, the Apocalypse', 'Dominaria United', '107', 76, 0.12),
    card('c8', 'Magic', 'The One Ring', 'Lord of the Rings', '246', 47.1, -0.05),
    card('c9', 'Magic', 'Ragavan, Nimble Pilferer', 'Modern Horizons 2', '138', 58.5, 0.02),
    card('c10', 'Yu-Gi-Oh!', 'Blue-Eyes White Dragon', 'Legend of Blue Eyes', 'LOB-001', 64.3, 0.01),
    card('c11', 'One Piece', 'Monkey.D.Luffy (Alt Art)', 'Romance Dawn', 'OP01-024', 84, 0.08),
    card('c12', 'Lorcana', 'Elsa – Spirit of Winter (Enchanted)', 'The First Chapter', '207/204', 189, -0.03),
    card('c13', 'Pokémon', 'Charizard (PSA 10)', 'Obsidian Flames', '223/197', 610, 0.05, 'graded'),
    card('c14', 'Pokémon', 'Umbreon VMAX (PSA 9)', 'Evolving Skies', '215/203', 520, 0.02, 'graded'),
    card('c15', 'Pokémon', 'Surging Sparks Booster Box', 'Surging Sparks', 'BB', 165, 0.1, 'sealed'),
    card('c16', 'Pokémon', 'Rattata', 'Pokémon 151', '019/165', 0.12, 0),
    card('c17', 'Pokémon', 'Gengar ex', 'Paldean Fates', '228/091', 38.2, 0.02),
    card('c18', 'Magic', 'Orcish Bowmasters', 'Lord of the Rings', '103', 32.5, -0.08),
  ];

  const settings: DB['settings'] = {
    vendor: { id: 'v1', name: 'Restockd', verified: true, city: 'Utrecht' },
    rules: {
      base: 'trend', showAdjustPct: -5, onlineAdjustPct: 8,
      conditionPct: { NM: 100, EX: 85, GD: 75, LP: 70, PL: 50 },
      languagePct: { EN: 0, NL: 0, JP: -10, DE: -15, FR: -15 },
      minMarginPct: 15, roundSmallTo: 50, roundLargeTo: 100, roundThreshold: 1000,
      bulkBelow: 100, bulkPrice: 25, reviewPct: 15, reviewAbs: 1000,
    },
    payoutSchedule: 'weekly', mollie: 'connected', commissionPct: 1.5,
    tagDomain: 't.restockd.app', tagCooldownMin: 0, currentMemberId: 'm1',
  };

  type Seed = [string, string, StockItem['condition'], StockItem['language'], number, string, Partial<StockItem>?];
  const seeds: Seed[] = [
    ['i1', 'c1', 'NM', 'EN', 60, 'Display case'],
    ['i2', 'c2', 'EX', 'EN', 310, 'Display case'],
    ['i3', 'c3', 'NM', 'EN', 95, 'Binder 1', { price: 12000 }],
    ['i4', 'c4', 'NM', 'EN', 30, 'Binder 1', { price: 6400 }],
    ['i5', 'c5', 'NM', 'JP', 180, 'Display case'],
    ['i6', 'c6', 'LP', 'EN', 55, 'Binder 2'],
    ['i7', 'c7', 'EX', 'EN', 58, 'Binder 2', { price: 5800 }],
    ['i8', 'c8', 'NM', 'EN', 28, 'Binder 2', { status: 'sold' }],
    ['i9', 'c9', 'NM', 'DE', 40, 'Binder 2'],
    ['i10', 'c10', 'LP', 'EN', 40, 'Binder 3'],
    ['i11', 'c11', 'NM', 'JP', 50, 'Binder 3', { consignorId: 'k1' }],
    ['i12', 'c12', 'NM', 'EN', 120, 'Display case', { consignorId: 'k1' }],
    ['i13', 'c13', 'NM', 'EN', 420, 'Slab case', { grader: 'PSA', grade: '10', cert: '84721956' }],
    ['i14', 'c14', 'NM', 'EN', 380, 'Slab case', { grader: 'PSA', grade: '9', cert: '73019245' }],
    ['i15', 'c15', 'NM', 'EN', 120, 'Sealed box'],
    ['i16', 'c16', 'NM', 'EN', 0.02, 'Bulk box'],
    ['i17', 'c17', 'EX', 'EN', 22, 'Binder 1', { consignorId: 'k2' }],
    ['i18', 'c18', 'NM', 'FR', 20, 'Binder 3', { status: 'sold' }],
  ];
  const scans = [41, 23, 17, 6, 12, 3, 9, 15, 2, 8, 11, 19, 28, 14, 7, 0, 5, 4];
  const items: StockItem[] = seeds.map(([id, cardId, condition, language, cost, location, extra], idx) => {
    const c = cards.find((x) => x.id === cardId)!;
    const base: StockItem = {
      id, cardId, condition, language, cost: Math.round(cost * 100), price: 0, location,
      channels: { ebay: idx % 3 !== 2, marktplaats: idx % 4 === 0, shop: true },
      status: 'in_stock', maxDiscountPct: 10, scans: scans[idx], addedAt: day(-40 + idx * 2),
      ...extra,
    };
    if (!extra?.price) base.price = computePrice(base, c, settings.rules, 'show').price;
    if (c.kind === 'graded') base.channels = { ebay: true, marktplaats: false, shop: true };
    return base;
  });

  const tag = (id: string, status: Tag['status'], itemId?: string, extra: Partial<Tag> = {}): Tag => ({
    id, chip: extra.chip ?? 'NTAG213', status, ownerId: 'v1', itemId, locked: true, scans: itemId ? items.find((i) => i.id === itemId)?.scans ?? 0 : 0,
    history: [{ at: day(-60), text: 'Programmed and locked at the factory' }, { at: day(-45), text: 'Shipped with order #1042' }, ...(itemId ? [{ at: day(-30), text: 'Linked to a card' }] : [])],
    orderId: '1042', ...extra,
  });
  const tags: Tag[] = [
    tag('04A3F2B1', 'active', 'i1'), tag('04A3F2B2', 'active', 'i2'), tag('04A3F2B3', 'active', 'i3'), tag('04A3F2B4', 'active', 'i5'),
    tag('04A3F2B5', 'active', 'i12'), tag('04A3F2B6', 'active', 'i11'), tag('04A3F2B7', 'active', 'i7'),
    tag('04D9E1C1', 'active', 'i13', { chip: 'NTAG424' }), tag('04D9E1C2', 'active', 'i14', { chip: 'NTAG424' }),
    tag('04A3F2C1', 'active', undefined, { location: 'Binder 2' }),
    tag('04A3F2C2', 'free'), tag('04A3F2C3', 'free'),
    tag('04A3F2C4', 'lost', undefined, { history: [{ at: day(-60), text: 'Programmed and locked at the factory' }, { at: day(-20), text: 'Marked as lost' }] }),
    tag('04A3F2C5', 'given', undefined, { history: [{ at: day(-60), text: 'Programmed and locked at the factory' }, { at: day(-12), text: 'Went with the buyer (sale receipt)' }] }),
    ...['04B7A001', '04B7A002', '04B7A003', '04B7A004', '04B7A005'].map((id) => tag(id, 'shipped', undefined, { orderId: '1077', history: [{ at: day(-5), text: 'Programmed and locked at the factory' }, { at: day(-2), text: 'Shipped with order #1077' }] })),
    { id: '04FF0001', chip: 'NTAG213', status: 'active', ownerId: 'v2', locked: true, scans: 4, history: [] },
  ];

  const shows: Show[] = [
    { id: 's1', name: 'Card Show Utrecht', city: 'Utrecht', country: 'NL', date: day(8), tables: 120, games: 'Pokémon, Magic, sports', entry: '€7.50', boothFee: 6500, vendors: 18, attending: true, booth: 'B14' },
    { id: 's2', name: 'Noord TCG Market', city: 'Groningen', country: 'NL', date: day(23), tables: 45, games: 'Pokémon, One Piece', entry: '€5', boothFee: 4000, vendors: 6, attending: false },
    { id: 's3', name: 'Winter Card Show', city: 'Eindhoven', country: 'NL', date: day(37), tables: 90, games: 'All games', entry: '€6', boothFee: 5500, vendors: 11, attending: false },
    { id: 's4', name: 'Flanders Card Fair', city: 'Ghent', country: 'BE', date: day(16), tables: 70, games: 'Pokémon, Lorcana', entry: '€6', boothFee: 5000, vendors: 9, attending: false },
    { id: 's5', name: 'Bourse TCG Wallonie', city: 'Namur', country: 'BE', date: day(30), tables: 40, games: 'Magic, Yu-Gi-Oh!', entry: '€4', boothFee: 3500, vendors: 3, attending: false },
    { id: 's6', name: 'Sammelkarten-Messe West', city: 'Düsseldorf', country: 'DE', date: day(15), tables: 200, games: 'All games', entry: '€10', boothFee: 9000, vendors: 14, attending: false },
    { id: 's7', name: 'TCG Börse Nord', city: 'Hamburg', country: 'DE', date: day(29), tables: 80, games: 'Pokémon, One Piece', entry: '€6', boothFee: 5000, vendors: 5, attending: false },
    { id: 's0', name: 'Autumn Card Show', city: 'Amersfoort', country: 'NL', date: day(-13), tables: 80, games: 'All games', entry: '€6', boothFee: 5500, vendors: 12, attending: true, booth: 'A3' },
    { id: 's00', name: 'Rotterdam Card Days', city: 'Rotterdam', country: 'NL', date: day(-34), tables: 100, games: 'All games', entry: '€7', boothFee: 6000, vendors: 15, attending: true, booth: 'C8' },
  ];

  const sale = (id: string, d: number, itemId: string | null, price: number, method: Sale['method'], channel: Sale['channel'], showId?: string, discount = 0): Sale => {
    const p = Math.round(price * 100);
    const viaWallet = method !== 'external' && method !== 'cash' && method !== 'tikkie';
    const item = itemId ? items.find((i) => i.id === itemId) : undefined;
    const fee = viaWallet ? providerFee(method, p) : 0;
    const commission = viaWallet ? Math.round((p * settings.commissionPct) / 100) : 0;
    const k = item?.consignorId === 'k1' ? 80 : item?.consignorId === 'k2' ? 85 : 0;
    return { id, at: day(d, 11 + (Number(id.slice(1)) % 6)), itemId: itemId ?? `x-${id}`, label: itemId ? undefined : ARCHIVE[Number(id.slice(1)) % ARCHIVE.length], price: p, discount: Math.round(discount * 100), method, channel, showId, soldBy: 'm1', fee, commission, viaWallet, consignorShare: k ? Math.round((p - fee - commission) * k / 100) : undefined };
  };
  const sales: Sale[] = [
    sale('s1', -34, null, 210, 'card', 'booth', 's00'), sale('s2', -34, null, 88, 'cash', 'booth', 's00'), sale('s3', -34, null, 145, 'ideal', 'tag', 's00'),
    sale('s4', -34, null, 62, 'tikkie', 'booth', 's00'), sale('s5', -33, null, 340, 'card', 'booth', 's00'),
    sale('s6', -28, null, 75, 'external', 'ebay'), sale('s7', -24, null, 39, 'external', 'marktplaats'),
    sale('s8', -13, null, 420, 'tap', 'booth', 's0'), sale('s9', -13, null, 96, 'ideal', 'tag', 's0'), sale('s10', -13, null, 58, 'cash', 'booth', 's0', 4),
    sale('s11', -13, null, 132, 'card', 'booth', 's0'), sale('s12', -13, null, 25, 'cash', 'booth', 's0'), sale('s13', -12, null, 260, 'ideal', 'tag', 's0'),
    sale('s14', -9, 'i8', 45, 'external', 'ebay'), sale('s15', -6, null, 64, 'ideal', 'shop'), sale('s16', -4, 'i18', 31, 'external', 'marktplaats'),
    sale('s17', -2, null, 118, 'ideal', 'shop'),
  ];

  const news: NewsItem[] = [
    { id: 'n1', game: 'Pokémon', kind: 'release', title: 'Next main set pre-orders open at most distributors', source: 'Example source', date: day(-1) },
    { id: 'n2', game: 'Pokémon', kind: 'mover', title: 'Pikachu ex 238/191 up 25% this week', source: 'Restockd prices', date: day(0), delta: 25 },
    { id: 'n3', game: 'Pokémon', kind: 'mover', title: 'Mew ex 232/091 down 27% after reprint news', source: 'Restockd prices', date: day(0), delta: -27 },
    { id: 'n4', game: 'Magic', kind: 'announcement', title: 'Banned and restricted update scheduled for Monday', source: 'Example source', date: day(-2) },
    { id: 'n5', game: 'Magic', kind: 'mover', title: 'Sheoldred, the Apocalypse up 12% in 30 days', source: 'Restockd prices', date: day(-1), delta: 12 },
    { id: 'n6', game: 'One Piece', kind: 'release', title: 'New booster set hits shelves in Europe next month', source: 'Example source', date: day(-3) },
    { id: 'n7', game: 'Lorcana', kind: 'announcement', title: 'Organized play season rules updated', source: 'Example source', date: day(-4) },
    { id: 'n8', game: 'Yu-Gi-Oh!', kind: 'release', title: 'Anniversary reprint collection announced', source: 'Example source', date: day(-5) },
  ];

  return {
    version: 3, settings, cards, items, tags, sales, shows, news,
    payouts: [
      { id: 'p1', at: day(-27), amount: 48000, status: 'paid' }, { id: 'p2', at: day(-20), amount: 9600, status: 'paid' },
      { id: 'p3', at: day(-6), amount: 52000, status: 'paid' }, { id: 'p4', at: day(3, 9), amount: 0, status: 'scheduled' },
    ],
    stolen: [
      { id: 'r1', grader: 'PSA', cert: '61234987', cardName: 'Charizard 4/102 Base Set (PSA 8)', reportedAt: day(-3), policeRef: 'NL-2026-118843', mine: true, status: 'active', hits: [{ at: day(-1, 15), where: 'Scanned at a vendor intake in Antwerp, BE' }] },
      { id: 'r2', grader: 'CGC', cert: '4011982033', cardName: 'Lugia Neo Genesis 9/111 (CGC 9.5)', reportedAt: day(-18), policeRef: 'DE-2026-55120', mine: false, status: 'active', hits: [] },
    ],
    consignors: [ { id: 'k1', name: 'Sam (friend)', ownerSharePct: 80, paidOut: 0 }, { id: 'k2', name: 'Noah – Discord', ownerSharePct: 85, paidOut: 0 } ],
    members: [ { id: 'm1', name: 'Jeraiya', role: 'owner' }, { id: 'm2', name: 'Lisa', role: 'helper', pin: '1234' } ],
    notices: [
      { id: 'no1', at: day(-1, 15), kind: 'stolen', text: 'Your stolen slab PSA 61234987 was scanned at a vendor intake in Antwerp, BE. We informed the vendor and saved the details for the police.' },
      { id: 'no2', at: day(0, 6), kind: 'price', text: 'Prices updated overnight. 2 changes need your review before the next show.' },
    ],
    otherCerts: ['55519870', '90012345'],
    vendors: [ { id: 'v2', name: 'Kaartenhoek Jesse', verified: true, city: 'Amersfoort' } ],
  };
}
