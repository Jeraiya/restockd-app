import type { Card, Cents, PricingRules, StockItem } from './types';

export type PriceChannel = 'show' | 'online';
export interface PriceStep { label: string; value: Cents }
export interface PriceResult {
  price: Cents;
  steps: PriceStep[];
  /** The rule that set the final price, shown to the vendor. */
  decidedBy: string;
}

const roundTo = (v: Cents, step: Cents) => (step > 0 ? Math.round(v / step) * step : v);

/**
 * Applies the vendor's pricing rules to one item.
 * Order: base market price → condition → language → channel adjustment → bulk → rounding → minimum margin.
 * Graded and sealed items skip the condition and language steps (their market price is already specific).
 */
export function computePrice(item: Pick<StockItem, 'condition' | 'language' | 'cost' | 'manualPrice'>, card: Pick<Card, 'kind' | 'market'>, rules: PricingRules, channel: PriceChannel = 'show'): PriceResult {
  if (item.manualPrice != null) {
    return { price: item.manualPrice, steps: [{ label: 'Fixed price (set by hand)', value: item.manualPrice }], decidedBy: 'Fixed price' };
  }
  const steps: PriceStep[] = [];
  const baseLabel = { trend: 'Cardmarket trend', low: 'Cardmarket lowest', avg30: '30-day average' }[rules.base];
  let v = card.market[rules.base];
  steps.push({ label: baseLabel, value: v });
  let decidedBy = 'Market price';

  if (card.kind === 'single') {
    const c = rules.conditionPct[item.condition] ?? 100;
    if (c !== 100) { v = Math.round((v * c) / 100); steps.push({ label: `Condition ${item.condition} (${c}%)`, value: v }); }
    const l = rules.languagePct[item.language] ?? 0;
    if (l !== 0) { v = Math.round((v * (100 + l)) / 100); steps.push({ label: `Language ${item.language} (${l > 0 ? '+' : ''}${l}%)`, value: v }); }
  }

  const adj = channel === 'show' ? rules.showAdjustPct : rules.onlineAdjustPct;
  if (adj !== 0) { v = Math.round((v * (100 + adj)) / 100); steps.push({ label: `${channel === 'show' ? 'At the show' : 'Online'} (${adj > 0 ? '+' : ''}${adj}%)`, value: v }); decidedBy = channel === 'show' ? 'Show price rule' : 'Online price rule'; }

  if (card.market[rules.base] < rules.bulkBelow) {
    v = rules.bulkPrice;
    steps.push({ label: 'Bulk price', value: v });
    decidedBy = 'Bulk price';
  } else {
    const r = v < rules.roundThreshold ? rules.roundSmallTo : rules.roundLargeTo;
    const rounded = roundTo(v, r);
    if (rounded !== v) { v = rounded; steps.push({ label: `Rounded to ${(r / 100).toFixed(2)}`, value: v }); }
  }

  const floor = Math.ceil((item.cost * (100 + rules.minMarginPct)) / 100);
  if (item.cost > 0 && v < floor) {
    v = floor;
    steps.push({ label: `Minimum: cost + ${rules.minMarginPct}%`, value: v });
    decidedBy = 'Minimum margin';
  }
  return { price: v, steps, decidedBy };
}

/** True when a price change is big enough that the vendor should approve it by hand. */
export function needsReview(oldPrice: Cents, newPrice: Cents, rules: Pick<PricingRules, 'reviewPct' | 'reviewAbs'>) {
  if (oldPrice <= 0) return false;
  const diff = Math.abs(newPrice - oldPrice);
  return diff >= rules.reviewAbs || (diff / oldPrice) * 100 >= rules.reviewPct;
}

export const pctChange = (from: Cents, to: Cents) => (from > 0 ? ((to - from) / from) * 100 : 0);

/** Payment-provider fee estimate per method, used in the demo wallet. */
export function providerFee(method: string, amount: Cents): Cents {
  switch (method) {
    case 'ideal': return 29;
    case 'card':
    case 'tap': return Math.round(amount * 0.018) + 25;
    default: return 0;
  }
}
