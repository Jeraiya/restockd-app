import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Delta, Empty, Field, GAME_ABBR, Modal, MoneyInput, Seg, Toggle, attempt, toast } from '../components/ui';
import { HoloThumb } from '../components/visual';
import { addItem, cardOf, isOwner, setLocation, setManualPrice, setMaxDiscount, tagOfItem, toggleChannel, useDB } from '../data/store';
import { fmt, fmtDate } from '../lib/money';
import { computePrice, pctChange } from '../lib/pricing';
import type { ChannelKey, Condition, Language, StockItem } from '../lib/types';

const LOCATIONS = ['Display case', 'Binder 1', 'Binder 2', 'Binder 3', 'Slab case', 'Sealed box', 'Bulk box'];
const CH: { key: ChannelKey; label: string }[] = [{ key: 'ebay', label: 'eBay' }, { key: 'marktplaats', label: 'MP' }, { key: 'shop', label: 'Shop' }];

export function Inventory() {
  const db = useDB();
  const [filter, setFilter] = useState<'all' | 'in_stock' | 'sold'>('in_stock');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => db.items.filter((i) => (filter === 'all' ? true : filter === 'sold' ? i.status === 'sold' : i.status !== 'sold'))
    .filter((i) => { const c = cardOf(db, i); return !q || `${c.name} ${c.set} ${c.number} ${i.cert ?? ''}`.toLowerCase().includes(q.toLowerCase()); }), [db, filter, q]);

  return (
    <Layout title="Inventory" sub={`${db.items.filter((i) => i.status !== 'sold').length} items in stock`} actions={<button className="btn primary" onClick={() => setAdding(true)}><Icon name="camera" />Scan to add</button>}>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg value={filter} onChange={setFilter} options={[{ key: 'in_stock', label: 'In stock' }, { key: 'sold', label: 'Sold' }, { key: 'all', label: 'All' }]} />
        <input id="inv-search" className="in" style={{ maxWidth: 320 }} placeholder="Search card, set, number or cert" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Card</th><th>Condition</th><th className="r">Cost</th><th className="r">Your price</th><th className="r">CM trend</th><th>Channels</th><th>Tag</th><th>Location</th></tr></thead>
            <tbody>
              {rows.map((i) => {
                const c = cardOf(db, i);
                const tag = tagOfItem(db, i.id);
                const ch30 = pctChange(c.market.history[0], c.market.trend);
                return (
                  <tr key={i.id} className="click" onClick={() => setOpen(i.id)}>
                    <td><div className="row"><HoloThumb game={c.game} kind={c.kind} size={46} label={c.kind === 'graded' ? i.grade : c.kind === 'sealed' ? 'BOX' : GAME_ABBR[c.game]} /><div><div className="name">{c.name}</div><div className="sub">{c.set} · {c.number}{i.consignorId && ' · consignment'}</div></div></div></td>
                    <td>{c.kind === 'single' ? <span className="badge">{i.condition} · {i.language}</span> : c.kind === 'graded' ? <span className="badge">{i.grader} {i.grade}</span> : <span className="badge">Sealed</span>}</td>
                    <td className="r">{fmt(i.cost)}</td>
                    <td className="r strong">{i.status === 'sold' ? <span className="muted">Sold</span> : fmt(i.price)}{i.manualPrice != null && <div className="sub">fixed</div>}</td>
                    <td className="r">{fmt(c.market.trend)}<div><Delta pct={ch30} /></div></td>
                    <td><div className="row">{CH.map((x) => <span key={x.key} className={`badge ${i.channels[x.key] ? (i.pausedOnline && x.key !== 'shop' ? 'warn' : 'pos') : ''}`}>{x.label}</span>)}</div></td>
                    <td>{tag ? <span className="badge neon">{tag.id}</span> : <span className="faint">—</span>}</td>
                    <td className="muted">{i.status === 'reserved' ? <span className="badge warn">Reserved</span> : i.location}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && <Empty title="Nothing here" text="Try another filter or add a card." />}
      </div>
      <p className="muted small">Orange channel badges are paused while the item is at a show.</p>
      {open && <ItemModal id={open} onClose={() => setOpen(null)} />}
      {adding && <AddModal onClose={() => setAdding(false)} />}
    </Layout>
  );
}

function ItemModal({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useDB();
  const it = db.items.find((i) => i.id === id)!;
  const c = cardOf(db, it);
  const owner = isOwner(db);
  const show = computePrice({ ...it, manualPrice: it.manualPrice }, c, db.settings.rules, 'show');
  const online = computePrice(it, c, db.settings.rules, 'online');
  const [manual, setManual] = useState(it.manualPrice ?? 0);
  const tag = tagOfItem(db, it.id);
  const cons = it.consignorId ? db.consignors.find((k) => k.id === it.consignorId) : undefined;
  return (
    <Modal title={c.name} sub={`${c.set} · ${c.number} · ${c.game}${it.cert ? ` · ${it.grader} cert ${it.cert}` : ''}`} onClose={onClose} size="wide">
      <div className="grid g-2">
        <div className="stack">
          <div className="summary">
            <div className="small muted strong" style={{ marginBottom: 6 }}>How the show price is built</div>
            {show.steps.map((s, i) => <div className="li" key={i}><div className="grow">{s.label}</div><div className="num">{fmt(s.value)}</div></div>)}
            <div className="li total"><div className="grow">Show price · decided by <b>{show.decidedBy}</b></div><div className="num">{fmt(show.price)}</div></div>
            <div className="li"><div className="grow muted">Online price (eBay, shop)</div><div className="num">{fmt(online.price)}</div></div>
          </div>
          <div className="small muted">Market data from the Cardmarket price guide · updated {fmtDate(c.market.updatedAt)}. Lowest {fmt(c.market.low)} · 30-day average {fmt(c.market.avg30)}.</div>
          {owner && (
            <div className="fg">
              <Field label="Fixed price (optional)" help="Overrides your rules for this card."><MoneyInput id="manual" value={manual} onChange={setManual} /></Field>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <button className="btn" onClick={() => attempt(() => setManualPrice(it.id, manual || undefined), manual ? 'Fixed price saved' : 'Back to your rules')}>Save price</button>
                {it.manualPrice != null && <button className="btn ghost" onClick={() => { setManual(0); attempt(() => setManualPrice(it.id, undefined), 'Back to your rules'); }}>Use rules</button>}
              </div>
            </div>
          )}
        </div>
        <div className="stack">
          <div className="fg">
            <Field label="Location"><select id="loc" className="in" value={it.location} onChange={(e) => setLocation(it.id, e.target.value)}>{LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select></Field>
            <Field label="Max discount for helpers" help="Helpers at your booth can't go lower."><input id="maxd" className="in r" type="number" min={0} max={50} value={it.maxDiscountPct} disabled={!owner} onChange={(e) => setMaxDiscount(it.id, Number(e.target.value))} /></Field>
          </div>
          <div>
            <div className="small muted strong" style={{ marginBottom: 8 }}>Sell on</div>
            {CH.map((x) => (
              <div className="li" key={x.key}>
                <div className="grow">{x.key === 'ebay' ? 'eBay' : x.key === 'marktplaats' ? 'Marktplaats' : 'Your Restockd shop page'}{it.pausedOnline && x.key !== 'shop' && it.channels[x.key] && <span className="badge warn" style={{ marginLeft: 8 }}>paused for show</span>}</div>
                <Toggle id={`ch-${x.key}`} label={x.key} on={it.channels[x.key]} onChange={() => it.status !== 'sold' && owner && toggleChannel(it.id, x.key)} />
              </div>
            ))}
          </div>
          <div className="li"><div className="grow">Tag</div>{tag ? <span className="badge neon">{tag.id}</span> : <Link className="btn sm" to="/tags">Link a tag</Link>}</div>
          <div className="li"><div className="grow">Scanned by buyers</div><b>{it.scans}×</b></div>
          {cons && <div className="li"><div className="grow">Consignment for {cons.name}</div><span className="badge">{cons.ownerSharePct}% to owner</span></div>}
          {tag && <Link className="btn" to={`/t/${tag.id}`}><Icon name="eye" />See what buyers see</Link>}
        </div>
      </div>
    </Modal>
  );
}

function AddModal({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const [cardId, setCardId] = useState(db.cards[0].id);
  const card = db.cards.find((c) => c.id === cardId)!;
  const [condition, setCondition] = useState<Condition>('NM');
  const [language, setLanguage] = useState<Language>('EN');
  const [cost, setCost] = useState(0);
  const [location, setLoc] = useState(LOCATIONS[1]);
  const [grader, setGrader] = useState<StockItem['grader']>('PSA');
  const [grade, setGrade] = useState('10');
  const [cert, setCert] = useState('');
  const [cons, setCons] = useState('');
  const preview = computePrice({ condition, language, cost }, card, db.settings.rules, 'show');
  const save = () => attempt(() => { addItem({ cardId, condition, language, cost, location, consignorId: cons || undefined, ...(card.kind === 'graded' ? { grader, grade, cert } : {}) }); onClose(); }, 'Added to your stock with a price');
  return (
    <Modal title="Scan to add" sub="In the app the camera recognises the card. In this demo you pick it from the catalogue." onClose={onClose} foot={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Add · {fmt(preview.price)}</button></>}>
      <div className="stack">
        <button className="scan-drop" onClick={() => toast('Camera scanning works in the mobile app. Pick the card below.')}><Icon name="camera" size={26} /><b>Point your camera at a card</b><span className="muted small">Set, number and language are recognised automatically</span></button>
        <Field label="Card"><select id="card" className="in" value={cardId} onChange={(e) => setCardId(e.target.value)}>{db.cards.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.set} {c.number}</option>)}</select></Field>
        {card.kind === 'single' && <div className="fg">
          <Field label="Condition"><select id="cond" className="in" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>{(['NM', 'EX', 'GD', 'LP', 'PL'] as Condition[]).map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Language"><select id="lang" className="in" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>{(['EN', 'JP', 'DE', 'FR', 'NL'] as Language[]).map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>}
        {card.kind === 'graded' && <div className="fg c3">
          <Field label="Grader"><select id="grader" className="in" value={grader} onChange={(e) => setGrader(e.target.value as StockItem['grader'])}>{['PSA', 'CGC', 'BGS', 'SGC'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Grade"><input id="grade" className="in" value={grade} onChange={(e) => setGrade(e.target.value)} /></Field>
          <Field label="Cert number" help="Try 61234987, 4011982033 or 55519870"><input id="cert" className="in" value={cert} onChange={(e) => setCert(e.target.value)} /></Field>
        </div>}
        <div className="fg">
          <Field label="Purchase price"><MoneyInput id="cost" value={cost} onChange={setCost} /></Field>
          <Field label="Location"><select id="aloc" className="in" value={location} onChange={(e) => setLoc(e.target.value)}>{LOCATIONS.map((l) => <option key={l}>{l}</option>)}</select></Field>
        </div>
        <Field label="Consignment (optional)"><select id="cons" className="in" value={cons} onChange={(e) => setCons(e.target.value)}><option value="">My own stock</option>{db.consignors.map((k) => <option key={k.id} value={k.id}>For {k.name}</option>)}</select></Field>
        <div className="notice"><Icon name="info" /><div>Price by your rules: <b>{fmt(preview.price)}</b> ({preview.decidedBy}). Trend {fmt(card.market.trend)}.</div></div>
      </div>
    </Modal>
  );
}
