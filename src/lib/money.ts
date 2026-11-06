import type { Cents } from './types';

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const fmt = (c: Cents) => eur.format(c / 100);
export const fmt0 = (c: Cents) => eur0.format(Math.round(c / 100));
export const fmtPct = (p: number) => `${Math.round(p)}%`;
export const signedPct = (p: number) => `${p > 0 ? '+' : ''}${Math.round(p)}%`;

export function parseEuro(s: string): Cents {
  let t = s.replace(/[€\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
