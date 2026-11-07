import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Empty, Field, Kpi, Modal, Seg, attempt, copyText, csv, download } from '../components/ui';
import { addConsignor, cardOf, consignorOwed, itemName, payConsignor, payoutNow, saleName, setPayoutSchedule, toggleChannel, useDB, walletSummary } from '../data/store';
import { fmt, fmtDate, fmtTime } from '../lib/money';

/* ---------- Wallet ---------- */
export function Wallet() {
  const db = useDB();
  const w = walletSummary(db);
  const [tab, setTab] = useState<'wallet' | 'elsewhere' | 'payouts'>('wallet');
  const sales = [...db.sales].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Layout title="Wallet" sub="Your own payment account, connected through Mollie" actions={<button className="btn primary" onClick={() => attempt(() => { const a = payoutNow(); return a; }, 'Payout started to your bank account')}><Icon name="download" />Pay out now</button>}>
      <div className="grid g-kpi">
        <Kpi hero label="Available" icon="wallet" value={fmt(w.available)} foot="Ready to pay out" />
        <Kpi label="On its way" icon="clock" value={fmt(w.pending)} foot="Available after 2 days" />
        <Kpi label="Sold elsewhere" icon="layers" value={fmt(w.elsewhere)} foot="eBay and Marktplaats pay you directly" />
        <Kpi label="Owed to consignors" icon="users" value={fmt(w.owedConsignors)} foot="Part of your balance" />
      </div>
      <div className="grid g-main mt">
        <div className="card flush">
          <div className="card-pad"><Seg value={tab} onChange={setTab} options={[{ key: 'wallet', label: 'Through Restockd' }, { key: 'elsewhere', label: 'Elsewhere' }, { key: 'payouts', label: 'Payouts' }]} /></div>
          {tab !== 'payouts' ? (
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Item</th><th>When</th><th>How</th><th className="r">Price</th>{tab === 'wallet' && <><th className="r">Fee</th><th className="r">Restockd</th><th className="r">You get</th></>}</tr></thead>
              <tbody>{sales.filter((s) => (tab === 'wallet' ? s.viaWallet : !s.viaWallet)).map((s) => (
                <tr key={s.id}>
                  <td className="name">{saleName(db, s)}</td><td className="muted">{fmtTime(s.at)}</td><td><span className="badge">{s.channel} · {s.method}</span></td>
                  <td className="r">{fmt(s.price)}</td>
                  {tab === 'wallet' && <><td className="r muted">−{fmt(s.fee)}</td><td className="r muted">−{fmt(s.commission)}</td><td className="r strong">{fmt(s.price - s.fee - s.commission)}</td></>}
                </tr>
              ))}</tbody>
            </table></div>
          ) : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Status</th><th className="r">Amount</th></tr></thead>
              <tbody>{[...db.payouts].reverse().map((p) => <tr key={p.id}><td>{fmtDate(p.at)}</td><td><span className={`badge ${p.status === 'paid' ? 'pos' : 'warn'}`}>{p.status === 'paid' ? 'Paid to bank' : 'Scheduled'}</span></td><td className="r strong">{p.status === 'paid' ? fmt(p.amount) : 'Whatever is available'}</td></tr>)}</tbody>
            </table></div>
          )}
          {tab === 'elsewhere' && <div className="card-pad muted small">eBay and Marktplaats pay you directly. Cash and Tikkie count in your cash-up but never pass through your wallet.</div>}
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Automatic payouts</h2></div>
            <Seg value={db.settings.payoutSchedule} onChange={setPayoutSchedule} options={[{ key: 'weekly', label: 'Weekly' }, { key: 'monthly', label: 'Monthly' }, { key: 'manual', label: 'When I want' }]} />
            <p className="muted small">Paid to the bank account you verified with Mollie.</p>
          </div>
          <div className="card">
            <div className="card-head"><h2>How the money flows</h2></div>
            <div className="list small">
              <div className="li"><Icon name="cart" /><div className="li-main">The buyer pays into <b>your own Mollie account</b>.</div></div>
              <div className="li"><Icon name="percent" /><div className="li-main">Restockd takes {db.settings.commissionPct}% automatically. The Mollie fee is shown per sale (example rates in this demo).</div></div>
              <div className="li"><Icon name="lock" /><div className="li-main">Restockd never holds your money. A block on one account never affects other vendors.</div></div>
            </div>
          </div>
          <button className="btn" onClick={() => download('restockd-sales.csv', csv([['Date', 'Item', 'Channel', 'Method', 'Price', 'Fee', 'Commission'], ...sales.map((s) => [s.at.slice(0, 10), saleName(db, s), s.channel, s.method, (s.price / 100).toFixed(2), (s.fee / 100).toFixed(2), (s.commission / 100).toFixed(2)])]))}><Icon name="download" />Export for your accountant</button>
        </div>
      </div>
    </Layout>
  );
}

/* ---------- Channels ---------- */
export function Channels() {
  const db = useDB();
  const live = db.items.filter((i) => i.status !== 'sold');
  const count = (k: 'ebay' | 'marktplaats' | 'shop') => live.filter((i) => i.channels[k] && !(i.pausedOnline && k !== 'shop')).length;
  const paused = live.filter((i) => i.pausedOnline).length;
  const [vinted, setVinted] = useState<string | null>(null);
  const cmCsv = () => download('cardmarket-export.csv', csv([['Name', 'Set', 'Number', 'Condition', 'Language', 'Price', 'Quantity'], ...live.filter((i) => cardOf(db, i).kind === 'single').map((i) => { const c = cardOf(db, i); return [c.name, c.set, c.number, i.condition, i.language, (i.price / 100).toFixed(2), 1]; })]));
  const CHS = [
    { name: 'eBay', status: 'Connected', cls: 'pos', text: 'Listings, stock and orders sync automatically. Sold anywhere means offline here.', n: count('ebay') },
    { name: 'Marktplaats', status: 'Partner request pending', cls: 'warn', text: 'Marktplaats only allows automatic listings for approved partners. We applied; until then you can copy listings by hand.', n: count('marktplaats') },
    { name: 'Your Restockd shop', status: 'Live', cls: 'pos', text: `restockd.app/${db.settings.vendor.name.toLowerCase()} with your whole stock and your online prices.`, n: count('shop') },
  ];
  return (
    <Layout title="Channels" sub="One stock, every place you sell">
      {paused > 0 && <div className="notice warn" style={{ marginBottom: 16 }}><Icon name="clock" /><div><b>Show mode:</b> {paused} items are paused on eBay and Marktplaats while they're at your show. They come back when you end the show.</div></div>}
      <div className="grid g-3">
        {CHS.map((c) => (
          <div key={c.name} className="card">
            <div className="card-head"><h2>{c.name}</h2><span className={`badge ${c.cls}`}>{c.status}</span></div>
            <p className="muted" style={{ marginTop: 0 }}>{c.text}</p>
            <div className="big-num">{c.n}</div><div className="muted small">items listed</div>
          </div>
        ))}
        <div className="card">
          <div className="card-head"><h2>Cardmarket</h2><span className="badge">Export</span></div>
          <p className="muted" style={{ marginTop: 0 }}>Cardmarket doesn't accept new API connections right now. Export your singles and upload them in one go. Check the column format against Cardmarket's import before uploading.</p>
          <button className="btn" onClick={cmCsv}><Icon name="download" />Download CSV</button>
        </div>
        <div className="card">
          <div className="card-head"><h2>Vinted</h2><span className="badge">Draft only</span></div>
          <p className="muted" style={{ marginTop: 0 }}>Vinted has no public API and blocks automated listings. We prepare the text, you post it yourself.</p>
          <select id="vinted-item" className="in" defaultValue="" onChange={(e) => { const it = live.find((i) => i.id === e.target.value); if (it) { const c = cardOf(db, it); setVinted(`${c.name} – ${c.set} ${c.number}\n\nCondition: ${it.condition} · Language: ${it.language}\nPrice: ${fmt(it.price)}\n\nShipped protected in a sleeve and toploader.`); } }}>
            <option value="" disabled>Pick an item for a draft…</option>{live.map((i) => <option key={i.id} value={i.id}>{itemName(db, i)}</option>)}
          </select>
        </div>
      </div>
      <div className="card flush mt">
        <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Per item</h2></div>
        <div className="table-wrap"><table className="t"><thead><tr><th>Item</th><th className="r">Price</th><th>eBay</th><th>Marktplaats</th><th>Shop</th></tr></thead>
          <tbody>{live.map((i) => <tr key={i.id}><td className="name">{itemName(db, i)}</td><td className="r">{fmt(i.price)}</td>{(['ebay', 'marktplaats', 'shop'] as const).map((k) => <td key={k}><label className="check"><input id={`c-${i.id}-${k}`} type="checkbox" checked={i.channels[k]} onChange={() => toggleChannel(i.id, k)} />{i.pausedOnline && k !== 'shop' && i.channels[k] ? <span className="badge warn">paused</span> : null}</label></td>)}</tr>)}</tbody>
        </table></div>
      </div>
      {vinted && <Modal title="Vinted draft" onClose={() => setVinted(null)} foot={<button className="btn primary" onClick={() => copyText(vinted)}>Copy text</button>}><textarea id="vinted-text" className="in" rows={8} readOnly value={vinted} /></Modal>}
    </Layout>
  );
}

/* ---------- Consignment ---------- */
export function Consignment() {
  const db = useDB();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [pct, setPct] = useState(80);
  return (
    <Layout title="Consignment" sub="Sell cards for friends and customers. Restockd splits the money for you." actions={<button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" />Add consignor</button>}>
      {db.consignors.length ? <div className="grid g-2">
        {db.consignors.map((k) => {
          const items = db.items.filter((i) => i.consignorId === k.id);
          const sold = items.filter((i) => i.status === 'sold');
          const owed = consignorOwed(db, k.id);
          return (
            <div key={k.id} className="card">
              <div className="card-head"><h2>{k.name}</h2><span className="badge">{k.ownerSharePct}% to owner · {100 - k.ownerSharePct}% to you</span></div>
              <div className="row between"><div><div className="muted small">Owed now</div><div className="big-num">{fmt(owed)}</div></div><button className="btn" disabled={!owed} onClick={() => attempt(() => payConsignor(k.id), 'Marked as paid out')}>Mark as paid</button></div>
              <div className="list mt">{items.map((i) => <div className="li" key={i.id}><div className="li-main"><div className="li-title">{itemName(db, i)}</div><div className="li-sub">{i.location}</div></div><div className="li-end">{i.status === 'sold' ? <span className="badge pos">Sold</span> : fmt(i.price)}</div></div>)}</div>
              <div className="muted small">{sold.length} of {items.length} sold · already paid {fmt(k.paidOut)}</div>
            </div>
          );
        })}
      </div> : <Empty title="No consignors yet" />}
      {adding && <Modal title="Add consignor" onClose={() => setAdding(false)} size="narrow" foot={<button className="btn primary" disabled={!name.trim()} onClick={() => attempt(() => { addConsignor(name.trim(), pct); setAdding(false); setName(''); }, 'Consignor added')}>Add</button>}>
        <div className="stack"><Field label="Name"><input id="kname" className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Share for the owner (%)" help="After payment fees and Restockd commission."><input id="kpct" className="in r" type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></Field></div>
      </Modal>}
    </Layout>
  );
}

/* ---------- Insights ---------- */
export function Insights() {
  const db = useDB();
  const live = db.items.filter((i) => i.status !== 'sold');
  const rows = [...db.items].sort((a, b) => b.scans - a.scans);
  const perShow = db.shows.filter((s) => s.attending && new Date(s.date) < new Date()).map((s) => {
    const sales = db.sales.filter((x) => x.showId === s.id);
    const rev = sales.reduce((a, x) => a + x.price, 0);
    return { name: s.name, revenue: rev / 100, net: (rev - s.boothFee) / 100, n: sales.length, fee: s.boothFee };
  });
  return (
    <Layout title="Insights" sub="What buyers look at, and which shows are worth it">
      <div className="grid g-main">
        <div className="card flush">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}><h2>Scans per item</h2><span className="hint">Only possible with tags</span></div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Item</th><th className="r">Scans</th><th className="r">Price</th><th>Signal</th></tr></thead>
            <tbody>{rows.map((i) => {
              const c = cardOf(db, i);
              const signal = i.status === 'sold' ? <span className="badge pos">Sold</span> : i.scans >= 20 ? <span className="badge warn">Lots of interest, not sold: price may be too high</span> : i.scans <= 3 ? <span className="badge">Few scans: move it to the display case?</span> : <span className="faint">—</span>;
              return <tr key={i.id}><td><div className="name">{c.name}</div><div className="sub">{i.location}</div></td><td className="r strong">{i.scans}</td><td className="r">{fmt(i.price)}<div className="sub">trend {fmt(c.market.trend)}</div></td><td>{signal}</td></tr>;
            })}</tbody>
          </table></div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Revenue per show</h2><span className="hint">after booth fee</span></div>
            <div style={{ height: 200 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={perShow}><XAxis dataKey="name" tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tip"><div className="muted small">{label}</div><div className="v">{fmt(Number(payload[0].value) * 100)}</div></div> : null} /><Bar dataKey="net" fill="#e6ff00" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <div className="list">{perShow.map((s) => <div className="li small" key={s.name}><div className="li-main">{s.name}</div><div className="muted">{s.n} sales</div><div className="li-end">{fmt(s.revenue * 100)} − {fmt(s.fee)}</div></div>)}</div>
          </div>
          <div className="card"><div className="card-head"><h2>Stock at a glance</h2></div>
            <div className="list small">
              <div className="li"><div className="li-main">Items in stock</div><b>{live.length}</b></div>
              <div className="li"><div className="li-main">Value at trend</div><b>{fmt(live.reduce((a, i) => a + cardOf(db, i).market.trend, 0))}</b></div>
              <div className="li"><div className="li-main">Purchase cost</div><b>{fmt(live.reduce((a, i) => a + i.cost, 0))}</b></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
