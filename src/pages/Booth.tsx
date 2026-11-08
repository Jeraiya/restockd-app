import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { toast } from '../components/ui';
import { HoloThumb, Money } from '../components/visual';
import { cardOf, flaggedCert, itemName, me, nextShow, sell, tapTag, useDB } from '../data/store';
import { fmt } from '../lib/money';
import type { PayMethod } from '../lib/types';

/**
 * Booth mode: one screen for selling at a card show.
 * Big touch targets, one-handed: tap a tag → pick a discount → pick how the buyer pays → done.
 */
interface Line { itemId: string; pct: number }
const METHODS: { key: PayMethod; label: string; icon: string }[] = [
  { key: 'tap', label: 'Tap to Pay', icon: 'wallet' },
  { key: 'ideal', label: 'iDEAL QR', icon: 'tag' },
  { key: 'cash', label: 'Cash', icon: 'receipt' },
  { key: 'tikkie', label: 'Tikkie', icon: 'send' },
];

export function Booth() {
  const db = useDB();
  const user = me(db);
  const owner = user.role === 'owner';
  const show = nextShow(db);
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<PayMethod>('tap');
  const [done, setDone] = useState<{ total: number; count: number; method: PayMethod; freed: number } | null>(null);
  const [pick, setPick] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (itemId: string) => {
    if (lines.some((l) => l.itemId === itemId)) { toast('Already in the basket'); return; }
    setLines([...lines, { itemId, pct: 0 }]);
  };
  const tap = (raw: string) => {
    const r = tapTag(raw); setCode('');
    if (r.type === 'linked' && r.item) {
      const it = r.item;
      if (it.status === 'reserved') toast(`${itemName(db, it)} is held for a buyer right now.`, true);
      else if (it.status === 'sold') toast('This card is already sold.', true);
      else if (flaggedCert(db, it.cert)) toast('This slab is reported stolen. Do not sell it.', true);
      else { add(it.id); toast(`${itemName(db, it)} added`); }
    } else if (r.type === 'linked' && r.tag.location) toast(`That tag is on ${r.tag.location}. Tap the card's own tag, or pick it from stock.`, true);
    else if (r.type === 'other') toast(`That tag belongs to ${r.owner}.`, true);
    else if (r.type === 'unknown') toast('Not a genuine Restockd tag.', true);
    else toast('This tag is not linked to a card.', true);
    input.current?.focus();
  };
  const priceOf = (l: Line) => { const it = db.items.find((i) => i.id === l.itemId)!; return Math.round((it.price * (100 - l.pct)) / 100); };
  const total = lines.reduce((a, l) => a + priceOf(l), 0);
  const pay = () => {
    try {
      let freed = 0;
      for (const l of lines) {
        const it = db.items.find((i) => i.id === l.itemId)!;
        if (db.tags.some((t) => t.itemId === it.id && t.status === 'active')) freed++;
        sell({ itemId: it.id, price: it.price, discount: it.price - priceOf(l), method, channel: 'booth', showId: show?.id });
      }
      setDone({ total, count: lines.length, method, freed }); setLines([]);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
  };

  if (done) return (
    <div className="booth">
      <div className="booth-receipt">
        <div className="receipt-check"><Icon name="check" size={34} /></div>
        <div className="muted">Paid with {METHODS.find((m) => m.key === done.method)?.label}</div>
        <div className="receipt-total"><Money cents={done.total} /></div>
        <div className="receipt-lines">
          <div><span>Cards sold</span><b>{done.count}</b></div>
          <div><span>Removed from eBay and your shop</span><b>Yes</b></div>
          <div><span>Tags free to reuse</span><b>{done.freed}</b></div>
          <div><span>{done.method === 'cash' || done.method === 'tikkie' ? 'Counted in your cash-up' : 'In your wallet'}</span><b>✓</b></div>
        </div>
        <button className="booth-next" onClick={() => { setDone(null); setTimeout(() => input.current?.focus(), 50); }}>Next customer</button>
      </div>
    </div>
  );

  const available = db.items.filter((i) => i.status === 'in_stock' && !lines.some((l) => l.itemId === i.id) && !flaggedCert(db, i.cert));
  return (
    <div className="booth">
      <header className="booth-top">
        <Link to="/" className="booth-exit" aria-label="Leave booth mode"><Icon name="x" /></Link>
        <div className="grow"><div className="booth-title">{show ? show.name : 'Booth mode'}</div><div className="booth-sub">{show ? `Booth ${show.booth} · ` : ''}{user.name}{owner ? '' : ' · helper'}</div></div>
        <Link to="/pos" className="booth-chip">Full checkout</Link>
      </header>

      <form className="booth-tap" onSubmit={(e) => { e.preventDefault(); if (code.trim()) tap(code); }}>
        <span className="booth-tap-ico"><Icon name="tag" size={26} /></span>
        <input ref={input} id="booth-code" autoFocus placeholder="Hold a tag to the phone, or type its code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      <div className="booth-tries">
        {['04A3F2B1', '04A3F2B2', '04D9E1C1'].map((c) => <button key={c} onClick={() => tap(c)}>{c}</button>)}
        <button onClick={() => setPick(!pick)}>{pick ? 'Close stock' : 'Pick from stock'}</button>
      </div>
      {pick && <div className="booth-pick">{available.map((i) => { const c = cardOf(db, i); return (
        <button key={i.id} onClick={() => { add(i.id); setPick(false); }}><HoloThumb game={c.game} kind={c.kind} size={44} /><span className="ellipsis">{c.name}</span><b>{fmt(i.price)}</b></button>
      ); })}</div>}

      <div className="booth-basket">
        {lines.length === 0 && <div className="booth-empty">Tap a tag to start a sale</div>}
        {lines.map((l) => {
          const it = db.items.find((i) => i.id === l.itemId)!; const c = cardOf(db, it);
          const max = owner ? 30 : it.maxDiscountPct;
          return (
            <div key={l.itemId} className="booth-line">
              <HoloThumb game={c.game} kind={c.kind} size={64} label={c.kind === 'graded' ? `${it.grader} ${it.grade}` : undefined} />
              <div className="grow">
                <div className="booth-name">{c.name}</div>
                <div className="booth-meta">Trend {fmt(c.market.trend)} · your price {fmt(it.price)}</div>
                <div className="booth-disc">
                  {[0, 5, 10, 15].filter((p) => p <= max).map((p) => <button key={p} className={l.pct === p ? 'on' : ''} onClick={() => setLines(lines.map((x) => (x.itemId === l.itemId ? { ...x, pct: p } : x)))}>{p ? `−${p}%` : 'Full'}</button>)}
                  {!owner && <span className="booth-max">max {it.maxDiscountPct}%</span>}
                </div>
              </div>
              <div className="booth-price"><Money cents={priceOf(l)} /></div>
              <button className="booth-x" aria-label="Remove" onClick={() => setLines(lines.filter((x) => x.itemId !== l.itemId))}><Icon name="x" /></button>
            </div>
          );
        })}
      </div>

      <footer className="booth-pay">
        <div className="booth-methods">{METHODS.map((m) => <button key={m.key} className={method === m.key ? 'on' : ''} onClick={() => setMethod(m.key)}><Icon name={m.icon} size={18} />{m.label}</button>)}</div>
        <button className="booth-go" disabled={!lines.length} onClick={pay}><span>Paid</span><Money cents={total} /></button>
      </footer>
    </div>
  );
}
