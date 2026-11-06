import { describe, expect, it } from 'vitest';
import { buildDemo } from '../data/demo';
import { computePrice, needsReview } from './pricing';

const db = buildDemo();
const rules = db.settings.rules;
const card = (id: string) => db.cards.find((c) => c.id === id)!;

describe('computePrice', () => {
  it('applies condition, show discount and rounding', () => {
    // Charizard ex trend €99.80 → EX 85% = €84.83 → −5% = €80.59 → rounded to €81
    const r = computePrice({ condition: 'EX', language: 'EN', cost: 0 }, card('c1'), rules, 'show');
    expect(r.price).toBe(8100);
  });
  it('online price is higher than show price', () => {
    const s = computePrice({ condition: 'NM', language: 'EN', cost: 0 }, card('c1'), rules, 'show');
    const o = computePrice({ condition: 'NM', language: 'EN', cost: 0 }, card('c1'), rules, 'online');
    expect(o.price).toBeGreaterThan(s.price);
  });
  it('never goes below cost plus minimum margin', () => {
    const r = computePrice({ condition: 'NM', language: 'EN', cost: 9000 }, card('c1'), rules, 'show');
    expect(r.price).toBe(10350);
    expect(r.decidedBy).toBe('Minimum margin');
  });
  it('uses the bulk price for cheap cards', () => {
    const r = computePrice({ condition: 'NM', language: 'EN', cost: 0 }, card('c16'), rules, 'show');
    expect(r.price).toBe(25);
  });
  it('a fixed price wins over the rules', () => {
    expect(computePrice({ condition: 'NM', language: 'EN', cost: 0, manualPrice: 1234 }, card('c1'), rules).price).toBe(1234);
  });
  it('graded cards skip the condition step', () => {
    const r = computePrice({ condition: 'PL', language: 'EN', cost: 0 }, card('c13'), rules, 'show');
    expect(r.steps.some((s) => s.label.startsWith('Condition'))).toBe(false);
  });
});

describe('needsReview', () => {
  it('flags big changes', () => {
    expect(needsReview(12000, 15000, rules)).toBe(true);
    expect(needsReview(9200, 9300, rules)).toBe(false);
  });
});
