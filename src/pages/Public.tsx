import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Brand } from '../components/Layout';
import { attempt } from '../components/ui';
import { buyerScan, cardOf, checkCert, releaseReservation, reserve, sell, useDB, vendorName } from '../data/store';
import { fmt, fmtTime } from '../lib/money';
import { pctChange } from '../lib/pricing';
import type { StockItem } from '../lib/types';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="buyer">
      <div className="buyer-top"><Link to="/" className="brand" style={{ padding: 0 }}><Brand /></Link><span className="badge">Buyer view</span></div>
      {children}
      <div className="buyer-foot">No app needed · <Link to="/check">Check a slab</Link> · <Link to="/">Back to the vendor app</Link></div>
    </div>
  );
}

/** What a buyer sees after tapping a tag or scanning its QR code. */
export function TagPage() {
  const { id = '' } = useParams();
  const db = useDB();
  const counted = useRef(false);
  useEffect(() => { if (!counted.current) { counted.current = true; buyerScan(id); } }, [id]);
  const tag = db.tags.find((t) => t.id === id.toUpperCase());
  const [paid, setPaid] = useState<string | null>(null);

  if (!tag || !tag.locked) return <Shell><div className="card buyer-card"><h2>Not a genuine Restockd tag</h2><p className="muted">We didn't make this tag, or it isn't locked. Don't trust a price behind it and ask the vendor.</p></div></Shell>;
  const owner = vendorName(db, tag.ownerId);
  const ownStore = tag.ownerId === db.settings.vendor.id;
  if (tag.status === 'lost') return <Shell><div className="card buyer-card"><h2>This tag was reported lost</h2><p className="muted">The owner has been notified of this scan. If you found it at a booth, ask the vendor.</p></div></Shell>;
  if (!ownStore) return <Shell><div className="card buyer-card"><div className="row between"><b>{owner}</b><span className="badge pos">Verified vendor</span></div><p className="muted">This tag belongs to another demo vendor. Their stock isn't part of this demo.</p></div></Shell>;

  if (paid) {
    const s = db.sales.find((x) => x.id === paid)!;
    const it = db.items.find((i) => i.id === s.itemId)!;
    return <Shell><div className="card buyer-card glow"><span className="badge pos">Paid</span><h2 style={{ marginTop: 10 }}>{cardOf(db, it).name}</h2><p className="muted">Receipt · {fmtTime(s.at)} · {fmt(s.price)} via iDEAL to {owner}. Show this screen at the booth.</p></div></Shell>;
  }

  if (tag.location && !tag.itemId) {
    const list = db.items.filter((i) => i.location === tag.location && i.status === 'in_stock').sort((a, b) => b.price - a.price);
    return (
      <Shell>
        <div className="card buyer-card">
          <div className="row between"><b>{owner}</b><span className="badge pos">Verified vendor</span></div>
          <h2 style={{ marginTop: 8 }}>{tag.location}</h2><p className="muted" style={{ marginTop: 2 }}>{list.length} cards, highest value first</p>
          <div className="list">{list.map((i) => <div key={i.id} className="li"><div className="li-main"><div className="li-title">{cardOf(db, i).name}</div><div className="li-sub">{i.condition} · trend {fmt(cardOf(db, i).market.trend)}</div></div><b>{fmt(i.price)}</b></div>)}</div>
        </div>
      </Shell>
    );
  }

  const item = tag.itemId ? db.items.find((i) => i.id === tag.itemId) : undefined;
  if (!item) {
    const last = [...tag.history].reverse().find((h) => h.text.startsWith('Sold'));
    return <Shell><div className="card buyer-card"><h2>{last ? 'Sold' : 'Nothing linked yet'}</h2><p className="muted">{last ? `This card has been sold by ${owner}.` : 'The vendor hasn\'t linked this tag yet.'} See more from {owner} at their booth.</p></div></Shell>;
  }
  return <Shell><ItemView item={item} owner={owner} onPaid={setPaid} /></Shell>;
}

function ItemView({ item, owner, onPaid }: { item: StockItem; owner: string; onPaid: (id: string) => void }) {
  const db = useDB();
  const c = cardOf(db, item);
  const diff = pctChange(c.market.trend, item.price);
  const reserved = item.status === 'reserved' && item.reservedUntil && new Date(item.reservedUntil) > new Date();
  return (
    <div className="card buyer-card">
      <div className="row between"><b>{owner}</b><span className="badge pos">✓ Verified vendor</span></div>
      <div className={`buyer-art ${c.kind}`}><span>{c.game}</span></div>
      <h2>{c.name}</h2>
      <div className="muted">{c.set} · {c.number} · {c.kind === 'graded' ? `${item.grader} ${item.grade} · cert ${item.cert}` : `${item.language} · ${item.condition}`}</div>
      <div className="row between" style={{ margin: '14px 0 6px' }}>
        <div className="big-num">{item.status === 'sold' ? 'Sold' : fmt(item.price)}</div>
        {item.status !== 'sold' && (diff < -0.5 ? <span className="pill up">{Math.abs(Math.round(diff))}% under trend</span> : diff > 0.5 ? <span className="pill flat">{Math.round(diff)}% over trend</span> : <span className="pill flat">At trend</span>)}
      </div>
      <div className="summary">
        <div className="li"><div className="grow">Cardmarket trend</div><div className="num">{fmt(c.market.trend)}</div></div>
        <div className="li"><div className="grow">Cardmarket lowest</div><div className="num">{fmt(c.market.low)}</div></div>
        <div className="li"><div className="grow">30-day average</div><div className="num">{fmt(c.market.avg30)}</div></div>
        <div className="li"><div className="grow muted">Updated</div><div className="muted small">{fmtTime(c.market.updatedAt)}</div></div>
      </div>
      {item.status === 'in_stock' && (
        <div className="stack mt">
          <button className="btn primary big" onClick={() => attempt(() => onPaid(sell({ itemId: item.id, price: item.price, method: 'ideal', channel: 'tag' }).id))}>Pay {fmt(item.price)} with iDEAL</button>
          <button className="btn" onClick={() => attempt(() => reserve(item.id, 15), 'Held for 15 minutes. Walk to the booth.')}><Icon name="clock" />Hold for 15 minutes</button>
        </div>
      )}
      {reserved && <div className="notice mt"><Icon name="clock" /><div>Held until {fmtTime(item.reservedUntil!)}. <button className="link-btn" onClick={() => releaseReservation(item.id)}>Release</button></div></div>}
      <p className="muted small" style={{ marginBottom: 0 }}>Demo: paying here marks the card as sold in the vendor app. No real money moves.</p>
    </div>
  );
}

/** Public certificate check for buyers. */
export function CheckPage() {
  const [cert, setCert] = useState('');
  const [res, setRes] = useState<ReturnType<typeof checkCert> | null>(null);
  return (
    <Shell>
      <div className="card buyer-card">
        <h2>Is this slab stolen?</h2>
        <p className="muted">Enter the certificate number before you buy. Free, no account needed.</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setRes(checkCert(cert)); }}>
          <input id="pub-cert" className="in" placeholder="e.g. 61234987" value={cert} onChange={(e) => { setCert(e.target.value); setRes(null); }} />
          <button className="btn primary" type="submit">Check</button>
        </form>
        {res && (res.stolen
          ? <div className="notice warn mt"><Icon name="alert" /><div><b>Reported stolen.</b> Don't buy it and don't confront the seller. The owner has been notified of this check.</div></div>
          : <div className="notice mt"><Icon name="check" /><div>Not reported as stolen in Restockd. Also check the cert on the grader's website.</div></div>)}
      </div>
    </Shell>
  );
}
