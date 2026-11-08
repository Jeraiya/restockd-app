import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Seg, attempt } from '../components/ui';
import { Donut, HoloThumb, Money, PromoTile, Ring, WalletStack } from '../components/visual';
import { cardOf, dismissOnboarding, itemName, markNoticesRead, me, nextShow, onboardingSteps, payoutNow, priceChanges, saleName, tagOfItem, useDB, walletSummary } from '../data/store';
import { fmt, fmtDay, fmtTime } from '../lib/money';

const CH_COLORS: Record<string, string> = { booth: '#e6ff00', tag: '#ffffff', shop: '#9fb800', ebay: 'hatch', marktplaats: 'hatch' };

export function Overview() {
  const db = useDB();
  const user = me(db);
  const owner = user.role === 'owner';
  const steps = onboardingSteps(db);
  const doneSteps = steps.filter((x) => x.done).length;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const mineToday = db.sales.filter((s) => s.soldBy === user.id && new Date(s.at) >= today0);
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
  const showMarks = db.shows.filter((x) => x.attending && new Date(x.date) >= days[0] && new Date(x.date) <= new Date()).map((x) => ({ day: fmtDay(x.date), name: x.name }));
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

  const recent = [...db.sales].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  const netIn = (from: number, to: number) => db.sales.filter((s) => s.viaWallet && Date.now() - new Date(s.at).getTime() >= from * 86400000 && Date.now() - new Date(s.at).getTime() < to * 86400000).reduce((a, s) => a + s.price - s.fee - s.commission, 0);
  const prev = netIn(30, 60), cur = netIn(0, 30);
  const walletTrend = prev > 0 ? ((cur - prev) / prev) * 100 : undefined;
  const hot = [...inStock].sort((a, b) => b.scans - a.scans).slice(0, 6);
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

      {owner && !db.settings.onboarding.dismissed && doneSteps < steps.length && (
        <section className="card onboard">
          <div className="onboard-head">
            <div><h2>Get started</h2><div className="muted small">{doneSteps} of {steps.length} done · about 5 minutes</div></div>
            <div className="onboard-bar"><span style={{ width: `${(doneSteps / steps.length) * 100}%` }} /></div>
            <button className="btn sm ghost" onClick={dismissOnboarding}>Hide</button>
          </div>
          <div className="onboard-steps">
            {steps.map((st, i) => (
              <Link key={st.key} to={st.to} className={`ostep ${st.done ? 'done' : ''}`}>
                <span className="ostep-n">{st.done ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className="ostep-t">{st.label}</span>
                {!st.done && <Icon name="up" size={14} />}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="bento2">
        {/* Hero: black panel with balance, actions and the 3D card */}
        <section className="card dark hero2 b-hero">
          <div className="hero2-copy">
            <div className="hello">Hello, {user.name}</div>
            <div className="muted small">Stock value at trend</div>
            <div className="hero2-amount"><Money cents={inStock.reduce((a, i) => a + cardOf(db, i).market.trend, 0)} /></div>
            <div className="acts">
              <Link to="/booth" className="act"><span className="lime"><Icon name="cart" size={20} /></span>Booth mode</Link>
              {[
                { to: '/inventory', icon: 'camera', label: 'Add card' },
                { to: '/tags', icon: 'tag', label: 'Tap tag' },
                { to: '/shows', icon: 'clock', label: 'Shows' },
              ].map((a) => <Link key={a.label} to={a.to} className="act"><span><Icon name={a.icon} size={20} /></span>{a.label}</Link>)}
            </div>
            <div className="hero-stats">
              <div><b>{inStock.length}</b><span>In stock</span></div>
              <div><b>{db.tags.filter((t) => t.ownerId === db.settings.vendor.id && t.status === 'active').length}</b><span>Tags live</span></div>
              <div><b>{inStock.filter((i) => (i.channels.ebay || i.channels.marktplaats) && !i.pausedOnline).length}</b><span>Listed online</span></div>
              <div><b>{inStock.reduce((a, i) => a + i.scans, 0)}</b><span>Buyer scans</span></div>
            </div>
            <div className="slider">
              <div className="slider-head"><span className="muted small">Show readiness</span><b>{ready}%</b></div>
              <div className="slider-track"><div className="slider-fill" style={{ width: `${Math.max(6, ready)}%` }}><span className="slider-knob">⋮</span></div></div>
              <div className="muted small">{show ? <>{daysLeft} days until <b className="w">{show.name}</b> · booth {show.booth}</> : 'No show planned'}</div>
            </div>
          </div>
          <div className="hero2-chart">
            <div className="row between"><span className="muted small">Sold, last {range} days</span><Seg size="sm" value={range} onChange={setRange} options={[{ key: '30', label: '30d' }, { key: '90', label: '90d' }]} /></div>
            <div className="hero2-sold"><Money cents={rangeTotal} /> <span className="muted small">{inRange.length} sales</span></div>
            <div className="hero2-plot">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
                  <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6ff00" stopOpacity={0.55} /><stop offset="1" stopColor="#e6ff00" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="day" tickLine={false} axisLine={false} interval={Math.floor(n / 4)} />
                  <YAxis hide domain={[0, 'dataMax + 50']} />
                  <Tooltip cursor={{ stroke: 'rgba(255,255,255,.35)', strokeDasharray: '3 4' }} content={({ active, payload, label }) => active && payload?.length ? <div className="pill-tip light"><b>{fmt(Number(payload[0].value) * 100)}</b> {label}</div> : null} />
                  {showMarks.map((m) => <ReferenceLine key={m.day} x={m.day} stroke="rgba(255,255,255,.28)" strokeDasharray="3 4" label={{ value: m.name, position: 'insideTopLeft', fill: 'rgba(255,255,255,.7)', fontSize: 11 }} />)}
                  <Area type="monotone" dataKey="v" stroke="#e6ff00" strokeWidth={2} fill="url(#hg)" activeDot={{ r: 5, fill: '#fff', stroke: '#e6ff00', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>


        {owner ? (<>
        {/* Wallet: stacked cards, payout actions and transactions */}
        <section className="card wallet-panel b-wallet">
          <div className="card-head"><h2>My wallet</h2><Link className="wp-add" to="/wallet">Details</Link></div>
          <WalletStack cards={[
            { key: 'av', label: 'Available', amount: w.available, sub: `Mollie · payouts ${db.settings.payoutSchedule}`, tone: 'lime', trend: walletTrend },
            { key: 'pe', label: 'On its way', amount: w.pending, sub: 'Available after 2 days', tone: 'silver' },
            { key: 'el', label: 'Sold elsewhere', amount: w.elsewhere, sub: 'eBay and Marktplaats pay you directly', tone: 'blue' },
            { key: 'co', label: 'Owed to consignors', amount: w.owedConsignors, sub: 'Part of your balance', tone: 'graphite' },
          ]} />
          <div className="wp-actions">
            <Link className="wp-btn" to="/wallet"><Icon name="clock" size={16} />Schedule</Link>
            <button className="wp-btn lime" onClick={() => attempt(() => payoutNow(), 'Payout started to your bank account')}><Icon name="download" size={16} />Pay out</button>
          </div>
          <div className="row between wp-head"><b>Recent transactions</b><Link to="/wallet" className="muted small">View all</Link></div>
          <div className="pills">
            {recent.map((s) => (
              <div className="prow dark" key={s.id}>
                <span className={`li-ico ch-${s.channel}`}><Icon name={s.channel === 'ebay' || s.channel === 'marktplaats' ? 'layers' : s.channel === 'tag' ? 'tag' : 'cart'} size={16} /></span>
                <div className="grow"><div className="li-title ellipsis">{saleName(db, s)}</div><div className="li-sub">{fmtTime(s.at)}</div></div>
                <b className={s.viaWallet ? 'pos' : ''}>+<Money cents={s.viaWallet ? s.price - s.fee - s.commission : s.price} /></b>
              </div>
            ))}
          </div>
        </section>
        </>) : (<>
        {/* Booth helpers don't see the wallet; they see their own sales today */}
        <section className="card wallet-panel b-wallet">
          <div className="card-head"><h2>Today at the booth</h2></div>
          <div className="helper-total"><Money cents={mineToday.reduce((a, s) => a + s.price, 0)} /></div>
          <div className="muted small">{mineToday.length} sales by you today</div>
          <Link className="wp-btn lime" to="/booth"><Icon name="cart" size={16} />Open booth mode</Link>
          <div className="pills">{mineToday.slice(-4).reverse().map((s) => <div className="prow dark" key={s.id}><div className="grow"><div className="li-title ellipsis">{saleName(db, s)}</div><div className="li-sub">{fmtTime(s.at)} · {s.method}</div></div><b><Money cents={s.price} /></b></div>)}</div>
          <p className="muted small">The wallet and payouts are only visible to the owner.</p>
        </section>

        </>)}

        {/* Promo tiles */}
        <div className="b-promos">
          <PromoTile to="/settings" tone="lime" title={<>Invite a<br />vendor</>} visual={<div className="pv-invite"><i>J</i><i>S</i><i>+</i></div>} />
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
        {/* Buyers looking at */}
        <section className="card b-hot">
          <div className="card-head"><h2>Buyers are looking at</h2><Link className="round-btn sm" to="/insights" aria-label="Insights"><Icon name="up" size={16} /></Link></div>
          <div className="hot-grid six">
            {hot.map((i) => { const c = cardOf(db, i); return (
              <Link to="/inventory" key={i.id} className="hot">
                <HoloThumb game={c.game} kind={c.kind} size={88} label={c.kind === 'graded' ? `${i.grader} ${i.grade}` : undefined} />
                <div className="hot-name ellipsis">{itemName(db, i)}</div>
                <div className="row between small"><b><Money cents={i.price} /></b><span className="muted">{i.scans} scans</span></div>
              </Link>
            ); })}
          </div>
        </section>

      </div>
    </Layout>
  );
}
