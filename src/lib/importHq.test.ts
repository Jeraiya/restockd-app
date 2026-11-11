import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemo } from '../data/demo';
import { _setDB, getDB, importFromHq } from '../data/store';
import { SAMPLE_HQ_CSV, mapRow, parseAmount, parseCsv, readHqCsv } from './importHq';

beforeEach(() => _setDB(buildDemo()));

describe('HQ CSV parsing', () => {
  it('reads semicolons, quotes and decimal commas', () => {
    expect(parseCsv('a;b\n"x;y";"he said ""hi"""')).toEqual([['a', 'b'], ['x;y', 'he said "hi"']]);
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('€ 9,99')).toBe(999);
  });
  it('maps the HQ sample export', () => {
    const { rows, missing } = readHqCsv(SAMPLE_HQ_CSV);
    expect(missing).toEqual([]);
    const c = rows.map(mapRow);
    expect(c[0]).toMatchObject({ status: 'ok', kind: 'single', condition: 'NM', units: 1, unitCost: 2000 });
    expect(c[1]).toMatchObject({ kind: 'graded', grader: 'PSA', grade: '10', status: 'warn' });
    expect(c[2]).toMatchObject({ kind: 'sealed', units: 3, unitCost: 6000 });
    expect(c[4].status).toBe('skip');
    expect(c[5].reason).toMatch(/unique card imported once/);
  });
  it('reports missing columns', () => {
    expect(readHqCsv('foo;bar\n1;2').missing).toContain('name');
  });
});

describe('importFromHq', () => {
  it('adds items, keeps HQ prices and skips a second import of the same file', () => {
    const cands = readHqCsv(SAMPLE_HQ_CSV).rows.map(mapRow);
    const before = getDB().items.length;
    const r1 = importFromHq(cands, true);
    expect(r1.added).toBe(1 + 1 + 3 + 1 + 1);
    expect(getDB().items.length).toBe(before + r1.added);
    expect(getDB().items.find((i) => getDB().cards.find((c) => c.id === i.cardId)?.hqSku === 'RS-1001')!.price).toBe(4250);
    const r2 = importFromHq(cands, true);
    expect(r2.added).toBe(0);
    expect(r2.skipped).toBe(5);
  });
});
