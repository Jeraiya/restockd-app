import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Seg, attempt } from '../components/ui';
import { Donut, HoloThumb, Money, PromoTile, Ring, WalletCard3D } from '../components/visual';
import { cardOf, itemName, markNoticesRead, me, nextShow, payoutNow, priceChanges, saleName, tagOfItem, useDB, walletSummary } from '../data/store';
import { fmt, fmtDay, fmtTime } from '../lib/money';

const CH_COLORS: Record<string, string> = { booth: '#e6ff00', tag: '#ffffff', shop: '#9fb800', ebay: 'hatch', marktplaats: 'hatch' };

export function Overview() {
  const db = useDB();
  const user = me(db);
  const w = walletSummary(db);
  const [range, setRange] = useState<'30' | '90'>('30');
  const inStock = db.items.filter((i) => i.status !== 'sold');
  const review = priceChanges(db).filter((c) => c.review);
  const show = nextShow(db);
  const unread = db.notices.filter((n) => !n.read);

  // Sales series
  const n = Number(range);
  const days = Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1) + i); d.setHours(0, 0, 0, 0); return d; });
  const chart = days.map((d) => ({ day: fmtDay(d.toISOString()), v: db.sales.filter((s) => new Date(s.at).toDateString() === d.toDateString()).reduce((a, s) => a + s.price, 0) / 100 }));
  const inRange = db.sales.filter((s) => new Date(s.at) >= days[0]);
  const rangeTotal = inRange.reduce((a, s) => a + s.price, 0);

  // Channel split
  const byCh = (['booth', 'tag', 'shop', 'ebay', 'marktplaats'] as const).map((k) => ({ k, v: db.sales.filter((s) => s.channel === k).reduce((a, s) => a + s.price, 0) }));
  const chTotal = byCh.reduce((a, c) => a + c.v, 0);
  const online = byCh.filter((c) => c.k === 'ebay' || c.k === 'marktplaats').reduce((a, c) => a + c.v, 0);
  const parts = [
    { value: byCh[0].v, color: CH_COLORS.booth },
    { value: byCh[1].v, color: CH_COLORS.tag },
    { value: byCh[2].v, color: CH_COLORS.shop },
    { value: online, color: '', hatch: true },
  ];

  // Show readiness
  const daysLeft = show ? Math.max(0, Math.ceil((new Date(show.date).getTime() - Date.now()) / 86400000)) : 0;
  const bringing = show?.bringing?.length ? show.bringing : [...new Set(inStock.map((i) => i.location))].filter((l) => l !== 'Bulk box');
  const bringItems = inStock.filter((i) => bringing.includes(i.location));
  const tagged = bringItems.filter((i) => tagOfItem(db, i.id)).length;
  const checks = [
    { ok: review.length === 0, text: review.length ? `${review.length} prices to approve` : 'Prices approved' },
    { ok: bringItems.length > 0 && tagged === bringItems.length, text: `${tagged} of ${bringItems.length} cards tagged` },
    { ok: !!show?.frozen, text: show?.frozen ? 'Prices locked, online paused' : 'Lock prices and pause online' },
  ];
  const ready = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  const recent = [...db.sales].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  const hot = [...inStock].sort((a, b) => b.scans - a.scans).slice(0, 3);
  const listed = (k: 'ebay' | 'marktplaats' | 'shop') => inStock.filter((i) => i.channels[k] && !(i.pausedOnline && k !== 'shop')).length;

  return (
    <Layout title="Overview" sub={show ? `${daysLeft} days until ${show.name}` : undefined}>
      {unread.length > 0 && (
        <div className="alert-strip">
          {unread.slice(0, 2).map((x) => (
            <div key={x.id} className={`alert-pill ${x.kind === 'stolen' || x.kind === 'lost' ? 'warn' : ''}`}>
              <Icon name={x.kind === 'stolen' ? 'shield' : x.kind === 'lost' ? 'tag' : 'info'} /><span className="ellipsis">{x.text}</span>
            </div>
          ))}
          <button className="btn sm ghost" onClick={markNoticesRead}>Dismiss</button>
        </div>
      )}

      <div className="bento2">
        {/* Hero: black panel with balance, actions and the 3D card */}
        <section className="card dark hero2 b-hero">
          <div className="hero2-copy">
            <div className="hello">Hello, {user.name}</div>
            <div className="muted small">Available in your wallet</div>
            <div className="hero2-amount"><Money cents={w.available} /></div>
            <div className="acts">
              {[
                { to: '/pos', icon: 'cart', label: 'Sell' },
                { to: '/inventory', icon: 'camera', label: 'Add card' },
                { to: '/tags', icon: 'tag', label: 'Tap tag' },
              ].map((a) => <Link key={a.label} to={a.to} className="act"><span><Icon name={a.icon} size={20} /></span>{a.label}</Link>)}
              <button className="act" onClick={() => attempt(() => payoutNow(), 'Payout started to your bank account')}><span className="lime"><Icon name="download" size={20} /></span>Pay out</button>
            </div>
            <div className="slider">
              <div className="slider-head"><span className="muted small">Show readiness</span><b>{ready}%</b></div>
              <div className="slider-track"><div className="slider-fill" style={{ width: `${Math.max(6, ready)}%` }}><span className="slider-knob">⋮</span></div></div>
              <div className="muted small">{show ? <>{daysLeft} days until <b className="w">{show.name}</b> · booth {show.booth}</> : 'No show planned'}</div>
            </div>
          </div>
          <div className="hero2-card">
            <WalletCard3D amount={fmt(w.available)} label="Available now" sub={`${fmt(w.pending)} on its way`} owner={db.settings.vendor.name}
              back={[{ label: 'On its way', value: fmt(w.pending) }, { label: 'Sold elsewhere', value: fmt(w.elsewhere) }, { label: 'Owed to consignors', value: fmt(w.owedConsignors) }, { label: 'Paid out so far', value: fmt(w.paid) }]} />
          </div>
        </section>

        {/* Promo tiles */}
        <div className="b-promos">
          <PromoTile to="/show-ready" tone="lime" title={<>Show<br />ready</>} visual={<div className="pv-ring"><span>{ready}%</span></div>} />
          <PromoTile to="/tags" tone="lime" title={<>Order<br />tags</>} visual={<div className="pv-tags"><i /><i /><i /></div>} />
          <PromoTile to="/stolen" tone="black" title={<>Check<br />a slab</>} visual={<div className="pv-slab"><Icon name="shield" size={26} /></div>} />
        </div>

        {/* Channels donut */}
        <section className="card dark b-donut">
          <div className="card-head"><h2>Sales by channel</h2></div>
          <div className="donut-wrap">
            <Donut parts={parts}>
              <div className="muted small">All time</div>
              <div className="donut-total"><Money cents={chTotal} /></div>
            </Donut>
            <div className="chip-float"><span className="muted small">At the booth</span><b><Money cents={byCh[0].v} /></b></div>
          </div>
          <div className="legend2">
            <span><i style={{ background: CH_COLORS.booth }} />Booth</span>
            <span><i style={{ background: CH_COLORS.tag }} />Tag scan</span>
            <span><i style={{ background: CH_COLORS.shop }} />Shop</span>
            <span><i className="hatch-i" />eBay & Marktplaats</span>
          </div>
        </section>

        {/* Sales chart */}
        <section className="card b-chart">
          <div className="card-head"><h2>Sales</h2><Seg size="sm" value={range} onChange={setRange} options={[{ key: '30', label: '30 days' }, { key: '90', label: '90 days' }]} /></div>
          <div className="chart-total"><Money cents={rangeTotal} /><span className="muted small"> · {inRange.length} sales</span></div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
                <defs>
                  <pattern id="hatchA" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#ffffff" /><rect width="3" height="8" fill="#e4e6ea" /></pattern>
                </defs>
                <XAxis dataKey="day" tickLine={false} axisLine={false} interval={Math.floor(n / 5)} />
                <YAxis hide domain={[0, 'dataMax + 50']} />
                <Tooltip cursor={{ stroke: '#0a0a0b', strokeDasharray: '3 4' }} content={({ active, payload, label }) => active && payload?.length ? <div className="pill-tip"><b>{fmt(Number(payload[0].value) * 100)}</b> {label}</div> : null} />
                <Area type="monotone" dataKey="v" stroke="#0a0a0b" strokeWidth={2} fill="url(#hatchA)" dot={false} activeDot={{ r: 5, fill: '#e6ff00', stroke: '#0a0a0b', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Next show */}
        <section className="card b-show">
          <div className="card-head"><h2>Next show</h2></div>
          {show ? (
            <div className="stack">
              <div className="row"><Ring pct={ready} size={96}><div className="ring-big">{daysLeft}</div><div className="ring-small">days</div></Ring>
                <div className="grow"><div className="show-name">{show.name}</div><div className="muted small">{fmtDay(show.date)} · booth {show.booth}</div></div></div>
              <div className="checks">{checks.map((c) => <div key={c.text} className={`chk ${c.ok ? 'ok' : ''}`}><span className="chk-dot">{c.ok ? <Icon name="check" size={13} /> : null}</span>{c.text}</div>)}</div>
              <Link className="btn primary" to="/show-ready">{ready === 100 ? 'Ready to go' : 'Get show ready'}</Link>
            </div>
          ) : <Link className="btn primary" to="/shows">Find a show</Link>}
        </section>

        {/* Buyers looking at */}
        <section className="card b-hot">
          <div className="card-head"><h2>Buyers are looking at</h2><Link className="round-btn sm" to="/insights" aria-label="Insights"><Icon name="up" size={16} /></Link></div>
          <div className="hot-grid three">
            {hot.map((i) => { const c = cardOf(db, i); return (
              <Link to="/inventory" key={i.id} className="hot">
                <HoloThumb game={c.game} kind={c.kind} size={88} label={c.kind === 'graded' ? `${i.grader} ${i.grade}` : undefined} />
                <div className="hot-name ellipsis">{itemName(db, i)}</div>
                <div className="row between small"><b><Money cents={i.price} /></b><span className="muted">{i.scans} scans</span></div>
              </Link>
            ); })}
          </div>
        </section>

        {/* Recent sales */}
        <section className="card b-recent">
          <div className="card-head"><h2>Recent sales</h2><Link className="round-btn sm" to="/wallet" aria-label="Wallet"><Icon name="up" size={16} /></Link></div>
          <div className="pills">
            {recent.map((s) => (
              <div className="prow" key={s.id}>
                <span className={`li-ico ch-${s.channel}`}><Icon name={s.channel === 'ebay' || s.channel === 'marktplaats' ? 'layers' : s.channel === 'tag' ? 'tag' : 'cart'} size={16} /></span>
                <div className="grow"><div className="li-title ellipsis">{saleName(db, s)}</div><div className="li-sub">{fmtTime(s.at)} · {s.channel}</div></div>
                <b><Money cents={s.price} /></b>
              </div>
            ))}
          </div>
        </section>

        {/* Channels */}
        <section className="card b-channels">
          <div className="card-head"><h2>Selling on</h2><Link className="round-btn sm" to="/channels" aria-label="Channels"><Icon name="up" size={16} /></Link></div>
          <div className="chan-grid">
            {[
              { n: 'eBay', s: `${listed('ebay')} listed`, l: 'e' },
              { n: 'Marktplaats', s: 'Partner pending', l: 'M' },
              { n: 'Your shop', s: `${listed('shop')} listed`, l: 'R' },
              { n: 'Cardmarket', s: 'CSV export', l: 'C' },
            ].map((c) => <div key={c.n} className="chan"><span className="chan-logo">{c.l}</span><div><div className="li-title">{c.n}</div><div className="li-sub">{c.s}</div></div></div>)}
          </div>
        </section>
      </div>
    </Layout>
  );
}
