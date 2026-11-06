import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Kpi } from '../components/ui';
import { cardOf, itemName, markNoticesRead, nextShow, priceChanges, saleName, useDB, walletSummary } from '../data/store';
import { fmt, fmt0, fmtDay, fmtTime } from '../lib/money';

export function Overview() {
  const db = useDB();
  const w = walletSummary(db);
  const inStock = db.items.filter((i) => i.status !== 'sold');
  const stockValue = inStock.reduce((a, i) => a + cardOf(db, i).market.trend, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = db.sales.filter((s) => new Date(s.at) >= monthStart);
  const review = priceChanges(db).filter((c) => c.review);
  const show = nextShow(db);
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); d.setHours(0, 0, 0, 0); return d; });
  const chart = days.map((d) => ({ day: fmtDay(d.toISOString()), v: db.sales.filter((s) => new Date(s.at).toDateString() === d.toDateString()).reduce((a, s) => a + s.price, 0) / 100 }));
  const recent = [...db.sales].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const scanned = [...inStock].sort((a, b) => b.scans - a.scans).slice(0, 5);
  const unread = db.notices.filter((n) => !n.read);

  return (
    <Layout title={`Hi ${db.settings.vendor.name}`} sub="Everything for your next show in one place" actions={<Link className="btn primary" to="/pos"><Icon name="cart" />Open checkout</Link>}>
      {unread.length > 0 && (
        <div className="stack" style={{ marginBottom: 16 }}>
          {unread.map((n) => (
            <div key={n.id} className={`notice ${n.kind === 'stolen' || n.kind === 'lost' ? 'warn' : ''}`}>
              <Icon name={n.kind === 'stolen' ? 'shield' : n.kind === 'lost' ? 'tag' : 'info'} />
              <div className="grow"><b>{fmtTime(n.at)}</b> · {n.text}</div>
            </div>
          ))}
          <div><button className="btn sm ghost" onClick={markNoticesRead}>Mark all as read</button></div>
        </div>
      )}
      <div className="grid g-kpi">
        <Kpi hero label="Available in wallet" icon="wallet" value={fmt(w.available)} foot={<>{fmt(w.pending)} on its way · payouts {db.settings.payoutSchedule}</>} />
        <Kpi label="Stock value (trend)" icon="box" value={fmt0(stockValue)} foot={`${inStock.length} items · ${db.tags.filter((t) => t.status === 'active').length} tags live`} />
        <Kpi label="Sold this month" icon="cart" value={fmt0(month.reduce((a, s) => a + s.price, 0))} foot={`${month.length} sales`} />
        <Kpi label="Prices to review" icon="trending" value={review.length} foot={<Link to="/show-ready" className="muted">Open Show ready →</Link>} />
      </div>

      <div className="grid g-main mt">
        <div className="card">
          <div className="card-head"><h2>Sales, last 30 days</h2><span className="hint">All channels</span></div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6ff00" stopOpacity={0.45} /><stop offset="1" stopColor="#e6ff00" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="day" tickLine={false} axisLine={false} interval={6} />
                <Tooltip cursor={{ stroke: 'rgba(255,255,255,.15)' }} content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tip"><div className="muted small">{label}</div><div className="v">{fmt(Number(payload[0].value) * 100)}</div></div> : null} />
                <Area type="monotone" dataKey="v" stroke="#e6ff00" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card today-card">
          <span className="badge neon">Next show</span>
          {show ? (
            <>
              <h2>{show.name}<br /><span>{fmtDay(show.date)}</span> · booth {show.booth}</h2>
              <div className="muted">{show.city} · {show.tables} tables · {show.vendors} Restockd vendors</div>
              <div className="duo">
                <Link className="btn light" to="/show-ready">{show.frozen ? 'Prices locked' : 'Get show ready'}</Link>
                <Link className="btn" to="/shows">All shows</Link>
              </div>
            </>
          ) : <><h2>No show planned</h2><Link className="btn light" to="/shows">Find a show</Link></>}
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head"><h2>Recent sales</h2><Link className="hint" to="/wallet">Wallet →</Link></div>
          <div className="list">
            {recent.map((s) => (
              <div className="li" key={s.id}>
                <div className="li-ico"><Icon name={s.channel === 'ebay' || s.channel === 'marktplaats' ? 'layers' : s.channel === 'tag' ? 'tag' : 'cart'} /></div>
                <div className="li-main"><div className="li-title">{saleName(db, s)}</div><div className="li-sub">{fmtTime(s.at)} · {s.channel} · {s.method}</div></div>
                <div className="li-end strong">{fmt(s.price)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Most scanned</h2><Link className="hint" to="/insights">Insights →</Link></div>
          <div className="list">
            {scanned.map((i) => (
              <div className="li" key={i.id}>
                <div className="li-ico">{i.scans}</div>
                <div className="li-main"><div className="li-title">{itemName(db, i)}</div><div className="li-sub">{i.location} · {fmt(i.price)}</div></div>
                <div className="li-end">{i.scans >= 20 && i.status === 'in_stock' ? <span className="badge warn">High interest, unsold</span> : <span className="badge">scans</span>}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
