import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { attempt } from '../components/ui';
import { HoloThumb, QuickAction, Ring, Spark, WalletCard3D } from '../components/visual';
import { cardOf, itemName, markNoticesRead, nextShow, payoutNow, priceChanges, saleName, tagOfItem, useDB, walletSummary } from '../data/store';
import { fmt, fmt0, fmtDay, fmtTime } from '../lib/money';

export function Overview() {
  const db = useDB();
  const w = walletSummary(db);
  const inStock = db.items.filter((i) => i.status !== 'sold');
  const stockValue = inStock.reduce((a, i) => a + cardOf(db, i).market.trend, 0);
  const stockHist = Array.from({ length: 30 }, (_, d) => inStock.reduce((a, i) => a + (cardOf(db, i).market.history[d] ?? 0), 0));
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = db.sales.filter((s) => new Date(s.at) >= monthStart);
  const review = priceChanges(db).filter((c) => c.review);
  const show = nextShow(db);

  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); d.setHours(0, 0, 0, 0); return d; });
  const daySales = days.map((d) => db.sales.filter((s) => new Date(s.at).toDateString() === d.toDateString()));
  const chart = days.map((d, i) => ({ day: fmtDay(d.toISOString()), v: daySales[i].reduce((a, s) => a + s.price, 0) / 100 }));
  let run = 0; const walletHist = daySales.map((list) => (run += list.filter((s) => s.viaWallet).reduce((a, s) => a + s.price - s.fee - s.commission, 0)));
  const salesHist = daySales.map((l) => l.length);

  const recent = [...db.sales].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const scanned = [...inStock].sort((a, b) => b.scans - a.scans).slice(0, 4);
  const unread = db.notices.filter((n) => !n.read);
  const total = w.available + w.pending + w.elsewhere;
  const pct = (v: number) => (total ? (v / total) * 100 : 0);

  // Show readiness: three checks a vendor understands at a glance.
  const daysLeft = show ? Math.max(0, Math.ceil((new Date(show.date).getTime() - Date.now()) / 86400000)) : 0;
  const bringing = show?.bringing?.length ? show.bringing : [...new Set(inStock.map((i) => i.location))].filter((l) => l !== 'Bulk box');
  const bringItems = inStock.filter((i) => bringing.includes(i.location));
  const tagged = bringItems.filter((i) => tagOfItem(db, i.id)).length;
  const checks = [
    { ok: review.length === 0, text: review.length ? `${review.length} prices to approve` : 'Prices approved' },
    { ok: bringItems.length > 0 && tagged === bringItems.length, text: `${tagged}/${bringItems.length} cards tagged` },
    { ok: !!show?.frozen, text: show?.frozen ? 'Prices locked, online paused' : 'Lock prices & pause online' },
  ];
  const ready = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  return (
    <Layout title={`${greeting()}, ${db.settings.vendor.name}`} sub={show ? `${daysLeft} days until ${show.name}` : 'Your stock, money and shows in one place'}>
      {unread.length > 0 && (
        <div className="alert-strip">
          {unread.slice(0, 2).map((n) => (
            <div key={n.id} className={`alert-pill ${n.kind === 'stolen' || n.kind === 'lost' ? 'warn' : ''}`}>
              <Icon name={n.kind === 'stolen' ? 'shield' : n.kind === 'lost' ? 'tag' : 'info'} />
              <span className="ellipsis">{n.text}</span>
            </div>
          ))}
          <button className="btn sm ghost" onClick={markNoticesRead}>Dismiss</button>
        </div>
      )}

      {/* Hero: wallet with 3D card */}
      <section className="hero-wallet card glow">
        <div className="hw-card"><WalletCard3D amount={fmt(w.available)} label="Available now" sub={`${fmt(w.pending)} on its way`} owner={db.settings.vendor.name} /></div>
        <div className="hw-info">
          <span className="badge neon"><Icon name="wallet" size={14} />Your wallet · Mollie</span>
          <div className="hw-amount">{fmt(w.available)}</div>
          <div className="muted">Ready to pay out to your bank. Payouts run <b className="text">{db.settings.payoutSchedule}</b>.</div>
          <div className="hw-bar" aria-label="Balance breakdown">
            <span style={{ width: `${pct(w.available)}%` }} className="b-av" />
            <span style={{ width: `${pct(w.pending)}%` }} className="b-pe" />
            <span style={{ width: `${pct(w.elsewhere)}%` }} className="b-el" />
          </div>
          <div className="hw-legend">
            <span><i className="b-av" />Available <b>{fmt0(w.available)}</b></span>
            <span><i className="b-pe" />On its way <b>{fmt0(w.pending)}</b></span>
            <span><i className="b-el" />Sold elsewhere <b>{fmt0(w.elsewhere)}</b></span>
          </div>
          <div className="row wrap">
            <button className="btn primary big" onClick={() => attempt(() => payoutNow(), 'Payout started to your bank account')}><Icon name="download" />Pay out now</button>
            <Link className="btn big" to="/wallet">View transactions</Link>
          </div>
          <div className="hw-spark"><span className="muted small">Earned through Restockd, last 30 days</span><Spark data={walletHist} height={52} /></div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="qa-grid">
        <QuickAction to="/pos" icon="cart" title="Sell" sub="Open checkout" accent />
        <QuickAction to="/inventory" icon="camera" title="Add cards" sub="Scan with your camera" />
        <QuickAction to="/tags" icon="tag" title="Tap a tag" sub="Link or reuse" />
        <QuickAction to="/show-ready" icon="check" title="Show ready" sub={review.length ? `${review.length} to check` : 'All set'} />
      </section>

      <div className="grid g-main mt">
        {/* Next show with readiness ring */}
        <section className="card show-card">
          <div className="card-head"><h2>Next show</h2>{show && <span className="badge">{show.city} · booth {show.booth}</span>}</div>
          {show ? (
            <div className="show-body">
              <Ring pct={ready}><div className="ring-big">{daysLeft}</div><div className="ring-small">days left</div></Ring>
              <div className="grow">
                <div className="show-name">{show.name}</div>
                <div className="muted small">{fmtDay(show.date)} · {show.tables} tables · {show.vendors} Restockd vendors</div>
                <div className="checks">
                  {checks.map((c) => <div key={c.text} className={`chk ${c.ok ? 'ok' : ''}`}><span className="chk-dot">{c.ok ? <Icon name="check" size={13} /> : null}</span>{c.text}</div>)}
                </div>
                <div className="row wrap"><Link className="btn primary" to="/show-ready">{ready === 100 ? 'Ready to go' : `Get ready · ${ready}%`}</Link><Link className="btn ghost" to="/shows">All shows</Link></div>
              </div>
            </div>
          ) : <div className="empty"><h3>No show planned</h3><Link className="btn primary" to="/shows">Find a show</Link></div>}
        </section>

        {/* Mini KPIs with sparklines */}
        <section className="stack">
          <div className="card mini-kpi">
            <div><div className="kpi-label"><Icon name="box" />Stock value</div><div className="kpi-value">{fmt0(stockValue)}</div><div className="kpi-foot">{inStock.length} items · trend price</div></div>
            <Spark data={stockHist} />
          </div>
          <div className="card mini-kpi">
            <div><div className="kpi-label"><Icon name="cart" />Sold this month</div><div className="kpi-value">{fmt0(month.reduce((a, s) => a + s.price, 0))}</div><div className="kpi-foot">{month.length} sales · all channels</div></div>
            <Spark data={salesHist} color="#3ddc84" />
          </div>
        </section>
      </div>

      <div className="grid g-main mt">
        <section className="card">
          <div className="card-head"><h2>Sales</h2><span className="hint">Last 30 days</span></div>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6ff00" stopOpacity={0.45} /><stop offset="1" stopColor="#e6ff00" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="day" tickLine={false} axisLine={false} interval={6} />
                <Tooltip cursor={{ stroke: 'rgba(255,255,255,.15)' }} content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tip"><div className="muted small">{label}</div><div className="v">{fmt(Number(payload[0].value) * 100)}</div></div> : null} />
                <Area type="monotone" dataKey="v" stroke="#e6ff00" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="list">
            {recent.map((s) => (
              <div className="li" key={s.id}>
                <div className={`li-ico ch-${s.channel}`}><Icon name={s.channel === 'ebay' || s.channel === 'marktplaats' ? 'layers' : s.channel === 'tag' ? 'tag' : 'cart'} /></div>
                <div className="li-main"><div className="li-title">{saleName(db, s)}</div><div className="li-sub">{fmtTime(s.at)} · {s.channel}</div></div>
                <div className="li-end strong">{fmt(s.price)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Buyers are looking at</h2><Link className="hint" to="/insights">Insights →</Link></div>
          <div className="hot-grid">
            {scanned.map((i) => {
              const c = cardOf(db, i);
              return (
                <Link to="/inventory" key={i.id} className="hot">
                  <HoloThumb game={c.game} kind={c.kind} size={84} label={c.kind === 'graded' ? `${i.grader} ${i.grade}` : undefined} />
                  <div className="hot-name ellipsis">{itemName(db, i)}</div>
                  <div className="row between small"><b>{fmt(i.price)}</b><span className="muted">{i.scans} scans</span></div>
                  {i.scans >= 20 && <span className="badge warn">Hot, unsold</span>}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </Layout>
  );
}

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
