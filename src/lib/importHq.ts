import type { Cents, Condition, Game, Kind, StockItem } from './types';

/**
 * Import of the stock export from Restockd HQ ("Voorraad → Exporteren").
 * HQ writes semicolon-separated CSV with a decimal comma and Dutch headers:
 * SKU;Type;Naam;Game;Set;Nummer;Conditie/Grade;Locatie;Voorraad;Verkoopprijs[;Kostprijs totaal;Marktwaarde]
 * Comma-separated files with a decimal point also work.
 */

export interface HqRow {
  line: number;
  sku: string;
  type: string;
  name: string;
  game: string;
  set: string;
  number: string;
  conditionGrade: string;
  location: string;
  qty: number;
  price: Cents;
  costTotal?: Cents;
  market?: Cents;
}

export interface ImportCandidate {
  row: HqRow;
  status: 'ok' | 'warn' | 'skip';
  reason?: string;
  kind?: Kind;
  game?: Game;
  condition?: Condition;
  grader?: StockItem['grader'];
  grade?: string;
  /** Units to create (unique items get one entry each). */
  units: number;
  unitCost: Cents;
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const first = clean.split(/\r?\n/, 1)[0] ?? '';
  const delim = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (q) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** "1.234,56" → 123456, "12.50" → 1250, "€ 9,99" → 999. */
export function parseAmount(s: string | undefined): Cents {
  if (!s) return 0;
  let t = s.replace(/[€\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const HEADERS: Record<string, keyof HqRow> = {
  sku: 'sku', type: 'type', naam: 'name', name: 'name', game: 'game', set: 'set', nummer: 'number', number: 'number',
  'conditie/grade': 'conditionGrade', 'condition/grade': 'conditionGrade', locatie: 'location', location: 'location',
  voorraad: 'qty', stock: 'qty', verkoopprijs: 'price', price: 'price', 'kostprijs totaal': 'costTotal', 'total cost': 'costTotal',
  marktwaarde: 'market', 'market value': 'market',
};

export function readHqCsv(text: string): { rows: HqRow[]; missing: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], missing: ['header row'] };
  const head = table[0].map((h) => HEADERS[h.trim().toLowerCase()]);
  const need: (keyof HqRow)[] = ['type', 'name', 'qty', 'price'];
  const missing = need.filter((k) => !head.includes(k));
  if (missing.length) return { rows: [], missing };
  const rows = table.slice(1).map((cells, i) => {
    const get = (k: keyof HqRow) => { const idx = head.indexOf(k); return idx >= 0 ? (cells[idx] ?? '').trim() : ''; };
    const has = (k: keyof HqRow) => head.includes(k);
    return {
      line: i + 2, sku: get('sku'), type: get('type'), name: get('name'), game: get('game'), set: get('set'), number: get('number'),
      conditionGrade: get('conditionGrade'), location: get('location') || 'Imported', qty: Math.max(0, Math.floor(Number(get('qty').replace(',', '.')) || 0)),
      price: parseAmount(get('price')), costTotal: has('costTotal') ? parseAmount(get('costTotal')) : undefined, market: has('market') ? parseAmount(get('market')) : undefined,
    } as HqRow;
  });
  return { rows, missing: [] };
}

export function mapGame(g: string): Game {
  const s = g.toLowerCase();
  if (s.includes('pok')) return 'Pokémon';
  if (s.includes('magic') || s === 'mtg') return 'Magic';
  if (s.includes('yu') || s.includes('ygo')) return 'Yu-Gi-Oh!';
  if (s.includes('one piece') || s === 'op') return 'One Piece';
  if (s.includes('lorcana')) return 'Lorcana';
  return 'Other';
}

const CONDITIONS: [RegExp, Condition][] = [
  [/^(nm|near ?mint|mint|m)$/i, 'NM'], [/^(ex|excellent)$/i, 'EX'], [/^(gd|good)$/i, 'GD'],
  [/^(lp|light(ly)? played)$/i, 'LP'], [/^(pl|played|poor)$/i, 'PL'],
];

export function mapRow(row: HqRow): ImportCandidate {
  const t = row.type.toLowerCase();
  const base: ImportCandidate = { row, status: 'ok', units: 0, unitCost: 0 };
  if (!row.name) return { ...base, status: 'skip', reason: 'No name' };
  if (row.qty <= 0) return { ...base, status: 'skip', reason: 'Not in stock' };
  if (t.startsWith('accessoire') || t.startsWith('accessor')) return { ...base, status: 'skip', reason: 'Accessories are not sold with tags' };
  const kind: Kind | undefined = t.startsWith('slab') || t.includes('graded') ? 'graded' : t.startsWith('sealed') ? 'sealed' : t.startsWith('losse') || t.startsWith('single') ? 'single' : undefined;
  if (!kind) return { ...base, status: 'skip', reason: `Unknown type "${row.type}"` };
  const game = mapGame(row.game);
  const warnings: string[] = [];
  if (game === 'Other') warnings.push('game not recognised');
  if (!row.price) warnings.push('no price');
  let condition: Condition = 'NM', grader: StockItem['grader'], grade: string | undefined;
  if (kind === 'graded') {
    const m = row.conditionGrade.match(/^(PSA|CGC|BGS|SGC)\s*([\d.]+)/i);
    if (m) { grader = m[1].toUpperCase() as StockItem['grader']; grade = m[2]; } else warnings.push('grader and grade not found');
    warnings.push('add the cert number after import');
  } else if (kind === 'single' && row.conditionGrade) {
    const hit = CONDITIONS.find(([re]) => re.test(row.conditionGrade.trim()));
    if (hit) condition = hit[1]; else warnings.push(`condition "${row.conditionGrade}" set to NM`);
  }
  const units = kind === 'sealed' ? Math.min(row.qty, 50) : 1;
  if (kind !== 'sealed' && row.qty > 1) warnings.push(`stock ${row.qty}, unique card imported once`);
  if (kind === 'sealed' && row.qty > 50) warnings.push('more than 50 units, first 50 imported');
  return {
    ...base, status: warnings.length ? 'warn' : 'ok', reason: warnings.join(' · ') || undefined, kind, game, condition, grader, grade, units,
    unitCost: row.costTotal ? Math.round(row.costTotal / row.qty) : 0,
  };
}

/** A small export in the exact HQ format, to try the import without a file. */
export const SAMPLE_HQ_CSV = [
  'SKU;Type;Naam;Game;Set;Nummer;Conditie/Grade;Locatie;Voorraad;Verkoopprijs;Kostprijs totaal;Marktwaarde',
  'RS-1001;Losse kaart;Gardevoir ex;Pokémon;Paldean Fates;245/091;Near Mint;Binder 4;1;42,50;20,00;44,10',
  'RS-1002;Slab (graded);Rayquaza VMAX;Pokémon;Evolving Skies;218/203;PSA 10;Slab case;1;389,00;250,00;402,00',
  'RS-1003;Sealed;Prismatic Evolutions Elite Trainer Box;Pokémon;Prismatic Evolutions;;;Sealed box;3;89,95;180,00;94,00',
  'RS-1004;Losse kaart;Liliana of the Veil;Magic;Innistrad;105;LP;Binder 4;1;28,00;15,00;31,20',
  'RS-1005;Accessoire;Toploaders 25 stuks;;;;;Kast;12;3,95;24,00;0,00',
  'RS-1006;Losse kaart;Dark Magician;Yu-Gi-Oh!;Legend of Blue Eyes;LOB-005;Excellent;Binder 4;2;55,00;60,00;58,00',
].join('\n');
