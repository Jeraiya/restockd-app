import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Empty, Field, Modal, Seg, attempt, toast } from '../components/ui';
import { cardOf, setAttending, useDB } from '../data/store';
import { fmt, fmtDate, fmtDay } from '../lib/money';
import type { Game, Show } from '../lib/types';

/* ---------- Card shows ---------- */
export function Shows() {
  const db = useDB();
  const [country, setCountry] = useState<Show['country']>('NL');
  const [join, setJoin] = useState<Show | null>(null);
  const [booth, setBooth] = useState('');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = db.shows.filter((s) => s.country === country && new Date(s.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Layout title="Card shows" sub="Every card show per country, with the vendors who are there">
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <Seg value={country} onChange={setCountry} options={[{ key: 'NL', label: 'Netherlands' }, { key: 'BE', label: 'Belgium' }, { key: 'DE', label: 'Germany' }]} />
        <span className="muted small">Example shows · organisers will add their own shows for free</span>
      </div>
      <div className="card flush">
        <div className="list">
          {upcoming.map((s) => (
            <div key={s.id} className="li card-pad" style={{ padding: '14px 20px' }}>
              <div className="li-ico date-chip"><b style={{ fontSize: 18 }}>{new Date(s.date).getDate()}</b><small>{new Date(s.date).toLocaleDateString('en-GB', { month: 'short' })}</small></div>
              <div className="li-main"><div className="li-title">{s.name}</div><div className="li-sub">{s.city} · {s.tables} tables · {s.games} · entry {s.entry} · table {fmt(s.boothFee)}</div></div>
              <div className="li-end stack" style={{ gap: 6, alignItems: 'flex-end' }}>
                <span className="badge neon">{s.vendors + (s.attending ? 0 : 0)} Restockd vendors</span>
                {s.attending ? <div className="row"><span className="badge pos">You're there · {s.booth}</span><button className="btn sm ghost" onClick={() => attempt(() => setAttending(s.id, false), 'Removed')}>Cancel</button></div>
                  : <button className="btn sm" onClick={() => { setJoin(s); setBooth(''); }}>I'm exhibiting</button>}
              </div>
            </div>
          ))}
        </div>
        {!upcoming.length && <Empty title="No shows yet in this country" />}
      </div>
      {join && <Modal title={`Exhibit at ${join.name}`} sub={`${fmtDay(join.date)} · ${join.city}`} onClose={() => setJoin(null)} size="narrow" foot={<button className="btn primary" onClick={() => { setAttending(join.id, true, booth || 'TBA'); setJoin(null); toast('Added. Buyers can now see you will be there.'); }}>Save</button>}>
        <Field label="Booth number" help="Buyers see your booth and your stock before the show."><input id="booth" className="in" value={booth} onChange={(e) => setBooth(e.target.value)} placeholder="e.g. B14" /></Field>
      </Modal>}
    </Layout>
  );
}

/* ---------- News ---------- */
export function News() {
  const db = useDB();
  const [game, setGame] = useState<'all' | Game>('all');
  const games = [...new Set(db.news.map((n) => n.game))];
  const yours = db.items.filter((i) => i.status !== 'sold').map((i) => ({ i, c: cardOf(db, i) })).map(({ i, c }) => ({ i, c, d: c.market.history[0] ? ((c.market.trend - c.market.history[0]) / c.market.history[0]) * 100 : 0 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5);
  return (
    <Layout title="News" sub="Releases, price movers and announcements per game">
      <div className="row wrap" style={{ marginBottom: 14 }}><Seg value={game} onChange={setGame} options={[{ key: 'all', label: 'All' }, ...games.map((g) => ({ key: g, label: g }))]} /></div>
      <div className="grid g-main">
        <div className="card">
          <div className="news-list">
            {db.news.filter((n) => game === 'all' || n.game === game).map((n) => (
              <div key={n.id} className="news-row">
                <div className="news-thumb"><Icon name={n.kind === 'mover' ? 'trending' : n.kind === 'release' ? 'box' : 'news'} /></div>
                <div className="news-main"><div className="news-title">{n.title}</div><div className="news-meta"><span className="badge">{n.game}</span><span>{n.kind}</span><span>· {n.source}</span><span>· {fmtDate(n.date)}</span></div></div>
                {n.delta != null && <span className={`pill ${n.delta > 0 ? 'up' : 'down'}`}>{n.delta > 0 ? '↑' : '↓'} {Math.abs(n.delta)}%</span>}
              </div>
            ))}
          </div>
          <p className="muted small">News items here are examples. The live version summarises public feeds and always links to the original source.</p>
        </div>
        <div className="card">
          <div className="card-head"><h2>Movers in your stock</h2><span className="hint">30 days</span></div>
          <div className="list">{yours.map(({ i, c, d }) => <div className="li" key={i.id}><div className="li-main"><div className="li-title">{c.name}</div><div className="li-sub">trend {fmt(c.market.trend)}</div></div><span className={`pill ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '↑' : '↓'} {Math.abs(Math.round(d))}%</span></div>)}</div>
          {yours.some((y) => y.d > 25) && <div className="notice mt"><Icon name="info" /><div>Some cards rose more than 25%. Worth listing them online too?</div></div>}
        </div>
      </div>
    </Layout>
  );
}
