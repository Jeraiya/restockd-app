import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Empty, Field, Modal, Seg, attempt, toast } from '../components/ui';
import { cardOf, isOwner, itemName, me, nextShow, saleName, sell, tapTag, useDB } from '../data/store';
import { fmt, fmtTime } from '../lib/money';
import type { PayMethod } from '../lib/types';

interface Line { itemId: string; discountPct: number }
const METHODS: { key: PayMethod; label: string; note: string }[] = [
  { key: 'tap', label: 'Tap to Pay', note: 'Buyer taps their card or phone on yours' },
  { key: 'ideal', label: 'iDEAL QR', note: 'Buyer scans a QR code and pays in their bank app' },
  { key: 'card', label: 'Card reader', note: 'Separate card terminal' },
  { key: 'cash', label: 'Cash', note: 'Counted in your cash-up, not in your wallet' },
  { key: 'tikkie', label: 'Tikkie', note: 'Counted in your cash-up, not in your wallet' },
];

export function Checkout() {
  const db = useDB();
  const owner = isOwner(db);
  const user = me(db);
  const show = nextShow(db);
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<PayMethod>('tap');
  const [tookTag, setTookTag] = useState(false);
  const [cashUp, setCashUp] = useState(false);
  const inStock = db.items.filter((i) => i.status === 'in_stock' && !lines.some((l) => l.itemId === i.id));
  const [pick, setPick] = useState('');

  const add = (itemId: string) => { if (!lines.some((l) => l.itemId === itemId)) setLines([...lines, { itemId, discountPct: 0 }]); };
  const addByTag = () => {
    const r = tapTag(code); setCode('');
    if (r.type === 'linked' && r.item && r.item.status === 'in_stock') { add(r.item.id); toast(`${itemName(db, r.item)} added`); }
    else if (r.type === 'other') toast(`That tag belongs to ${r.owner}.`, true);
    else if (r.type === 'unknown') toast('Not a genuine Restockd tag.', true);
    else toast('This tag is not linked to a card in stock.', true);
  };
  const total = lines.reduce((a, l) => { const it = db.items.find((i) => i.id === l.itemId)!; return a + Math.round(it.price * (100 - l.discountPct) / 100); }, 0);
  const pay = () => {
    attempt(() => {
      for (const l of lines) {
        const it = db.items.find((i) => i.id === l.itemId)!;
        sell({ itemId: it.id, price: it.price, discount: Math.round(it.price * l.discountPct / 100), method, channel: 'booth', showId: show?.id, buyerTookTag: tookTag });
      }
      setLines([]); setTookTag(false);
    }, `Paid ${fmt(total)} · removed from eBay and your shop`);
  };

  return (
    <Layout title="Checkout" sub={show ? `${show.name} · booth ${show.booth} · ${user.name}` : `Booth checkout · ${user.name}`} actions={<button className="btn" onClick={() => setCashUp(true)}><Icon name="receipt" />Cash-up</button>}>
      <div className="grid g-main">
        <div className="card">
          <div className="card-head"><h2>Basket</h2><span className="hint">{lines.length} items</span></div>
          <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (code.trim()) addByTag(); }}>
            <input id="pos-tag" className="in" style={{ maxWidth: 220 }} placeholder="Tap tag (e.g. 04A3F2B1)" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" type="submit"><Icon name="tag" />Add by tag</button>
            <select id="pos-pick" className="in" style={{ maxWidth: 280 }} value={pick} onChange={(e) => { if (e.target.value) { add(e.target.value); setPick(''); } }}>
              <option value="">Or pick from stock…</option>
              {inStock.map((i) => <option key={i.id} value={i.id}>{itemName(db, i)} · {fmt(i.price)}</option>)}
            </select>
          </form>
          {lines.length ? (
            <div className="list mt">
              {lines.map((l) => {
                const it = db.items.find((i) => i.id === l.itemId)!;
                const max = owner ? 50 : it.maxDiscountPct;
                return (
                  <div className="li" key={l.itemId}>
                    <div className="li-main"><div className="li-title">{itemName(db, it)}</div><div className="li-sub">{cardOf(db, it).set} · trend {fmt(cardOf(db, it).market.trend)}{!owner && ` · max ${it.maxDiscountPct}% off`}</div></div>
                    <label className="f" style={{ width: 110 }}><span>Discount %</span>
                      <input id={`disc-${l.itemId}`} className="in r" type="number" min={0} max={max} value={l.discountPct} onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value));
                        if (v > max) toast(`Helpers can give at most ${max}% on this card.`, true);
                        setLines(lines.map((x) => x.itemId === l.itemId ? { ...x, discountPct: Math.min(v, max) } : x));
                      }} />
                    </label>
                    <div className="li-end strong" style={{ width: 90 }}>{fmt(Math.round(it.price * (100 - l.discountPct) / 100))}</div>
                    <button className="btn ghost sm icon" aria-label="Remove" onClick={() => setLines(lines.filter((x) => x.itemId !== l.itemId))}><Icon name="x" /></button>
                  </div>
                );
              })}
            </div>
          ) : <Empty title="Basket is empty" text="Tap a tag or pick a card to start a sale." />}
        </div>
        <div className="card glow">
          <div className="card-head"><h2>Pay</h2></div>
          <div className="big-num">{fmt(total)}</div>
          <div className="stack mt" style={{ gap: 8 }}>
            {METHODS.map((m) => (
              <label key={m.key} className={`user-pick ${method === m.key ? 'on' : ''}`} style={method === m.key ? { borderColor: 'var(--neon)' } : undefined}>
                <input id={`pm-${m.key}`} type="radio" name="pm" checked={method === m.key} onChange={() => setMethod(m.key)} style={{ accentColor: 'var(--neon)' }} />
                <div><div className="strong">{m.label}</div><div className="small muted">{m.note}</div></div>
              </label>
            ))}
            <label className="check"><input id="took-tag" type="checkbox" checked={tookTag} onChange={(e) => setTookTag(e.target.checked)} />Buyer takes the tag (shows a sale receipt)</label>
            <button className="btn primary" disabled={!lines.length} onClick={pay}><Icon name="check" />Complete sale</button>
            <div className="small muted">Payments other than cash and Tikkie go to your own payment account. Restockd never holds your money.</div>
          </div>
        </div>
      </div>
      {cashUp && <CashUp showId={show?.id} onClose={() => setCashUp(false)} />}
    </Layout>
  );
}

function CashUp({ showId, onClose }: { showId?: string; onClose: () => void }) {
  const db = useDB();
  const shows = db.shows.filter((s) => s.attending).sort((a, b) => b.date.localeCompare(a.date));
  const [sid, setSid] = useState(showId ?? shows[0]?.id ?? '');
  const sales = db.sales.filter((s) => s.showId === sid);
  const by = (m: string) => sales.filter((s) => s.method === m).reduce((a, s) => a + s.price, 0);
  const [counted, setCounted] = useState('');
  const cash = by('cash');
  const diff = counted ? Math.round(parseFloat(counted.replace(',', '.')) * 100) - cash : 0;
  return (
    <Modal title="Cash-up" sub="Everything you sold at this show, per payment method" onClose={onClose}>
      <div className="stack">
        <Seg value={sid} onChange={setSid} options={shows.map((s) => ({ key: s.id, label: s.name }))} />
        <div className="summary">
          {[['tap', 'Tap to Pay'], ['ideal', 'iDEAL QR'], ['card', 'Card reader'], ['cash', 'Cash'], ['tikkie', 'Tikkie']].map(([k, l]) => <div className="li" key={k}><div className="grow">{l}</div><div className="num">{fmt(by(k))}</div></div>)}
          <div className="li total"><div className="grow">Total · {sales.length} sales</div><div className="num">{fmt(sales.reduce((a, s) => a + s.price, 0))}</div></div>
        </div>
        <Field label="Cash you counted" help={counted ? (diff === 0 ? 'Matches. Nice.' : `${diff > 0 ? 'More' : 'Less'} than expected: ${fmt(Math.abs(diff))}`) : 'Compare with the cash total above.'}><input id="counted" className="in r" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" /></Field>
        <div className="list">{sales.slice(-6).reverse().map((s) => <div className="li small" key={s.id}><div className="li-main">{saleName(db, s)}</div><div className="muted">{s.method}</div><div className="li-end">{fmtTime(s.at)} · {fmt(s.price)}</div></div>)}</div>
      </div>
    </Modal>
  );
}
