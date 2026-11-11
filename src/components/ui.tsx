import { ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { parseEuro } from '../lib/money';
import { Icon } from './Icon';

/* ---------- Toasts ---------- */
type T = { id: number; text: string; err?: boolean };
let list: T[] = [];
const subs = new Set<() => void>();
export function toast(text: string, err = false) {
  const t = { id: Date.now() + Math.random(), text, err };
  list = [...list, t]; subs.forEach((l) => l());
  setTimeout(() => { list = list.filter((x) => x.id !== t.id); subs.forEach((l) => l()); }, err ? 5500 : 3000);
}
/** Runs an action and shows its error as a toast. */
export function attempt(fn: () => unknown, ok?: string) {
  try { fn(); if (ok) toast(ok); return true; } catch (e) { toast(e instanceof Error ? e.message : String(e), true); return false; }
}
export function Toasts() {
  const l = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => list);
  return <div className="toasts" role="status" aria-live="polite">{l.map((t) => <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>{t.text}</div>)}</div>;
}

/* ---------- Modal ---------- */
export function Modal({ title, sub, onClose, children, foot, size }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; size?: 'wide' | 'narrow' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="grow"><h2>{title}</h2>{sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}</div>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ---------- Fields ---------- */
export function Field({ label, help, children, className }: { label: string; help?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={`f ${className || ''}`}><span>{label}</span>{children}{help && <span className="help">{help}</span>}</label>;
}
export function MoneyInput({ value, onChange, autoFocus, id }: { value: number; onChange: (c: number) => void; autoFocus?: boolean; id?: string }) {
  const show = (v: number) => (v ? (v / 100).toFixed(2) : '');
  const [text, setText] = useState(show(value));
  useEffect(() => { if (parseEuro(text) !== value) setText(show(value)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);
  return <div className="money"><input id={id} className="in r" inputMode="decimal" value={text} placeholder="0.00" autoFocus={autoFocus} onChange={(e) => { setText(e.target.value); onChange(parseEuro(e.target.value)); }} /></div>;
}

/* ---------- Display ---------- */
export function Kpi({ label, value, foot, icon, hero }: { label: string; value: ReactNode; foot?: ReactNode; icon?: string; hero?: boolean }) {
  return (
    <div className={`card kpi ${hero ? 'hero glow' : ''}`}>
      <div className="kpi-label">{icon && <Icon name={icon} />}{label}</div>
      <div className="kpi-value">{value}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}
export function Delta({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) return <span className="pill flat">0%</span>;
  return <span className={`pill ${pct > 0 ? 'up' : 'down'}`}>{pct > 0 ? '↑' : '↓'} {Math.abs(Math.round(pct))}%</span>;
}
export function Empty({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{text && <div>{text}</div>}{action}</div>;
}
export function Seg<T extends string>({ value, options, onChange, size }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; size?: 'sm' }) {
  return (
    <div className={`seg ${size || ''}`} role="tablist">
      {options.map((o) => <button key={o.key} className={o.key === value ? 'on' : ''} onClick={() => onChange(o.key)} role="tab" aria-selected={o.key === value}>{o.label}</button>)}
    </div>
  );
}
export function Toggle({ on, onChange, label, id }: { on: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <button id={id} type="button" className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}
export const GAME_ABBR: Record<string, string> = { 'Pokémon': 'PKM', Magic: 'MTG', 'Yu-Gi-Oh!': 'YGO', 'One Piece': 'OP', Lorcana: 'LOR', Other: 'TCG' };
export function Thumb({ kind, label }: { kind: string; label: string }) {
  return <div className={`thumb ${kind}`}>{label}</div>;
}
export function download(name: string, content: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed. Select the text and copy it by hand.', true); }
}
