import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Delta, Empty, Kpi, attempt, csv, download, toast } from '../components/ui';
import { approvePrices, endShow, isOwner, makeShowReady, nextShow, priceChanges, runNightlyUpdate, tagOfItem, useDB } from '../data/store';
import { fmt, fmtDay } from '../lib/money';
import { pctChange } from '../lib/pricing';

export function ShowReady() {
  const db = useDB();
  const show = nextShow(db);
  const changes = priceChanges(db);
  const review = changes.filter((c) => c.review);
  const auto = changes.filter((c) => !c.review);
  const locations = [...new Set(db.items.filter((i) => i.status !== 'sold').map((i) => i.location))];
  const [bring, setBring] = useState<string[]>(show?.bringing?.length ? show.bringing : locations.filter((l) => l !== 'Bulk box'));
  const owner = isOwner(db);
  const noTag = db.items.filter((i) => i.status === 'in_stock' && bring.includes(i.location) && !tagOfItem(db, i.id));
  const paused = db.items.filter((i) => i.pausedOnline).length;

  return (
    <Layout title="Show ready" sub={show ? `${show.name} · ${fmtDay(show.date)} · booth ${show.booth}` : 'No upcoming show'}
      actions={owner && <button className="btn" onClick={() => toast(`${runNightlyUpdate()} small changes applied`)}><Icon name="trending" />Run tonight's update now</button>}>
      <div className="grid g-kpi">
        <Kpi hero label="Updated automatically" icon="check" value={auto.length} foot="Small changes within your rules" />
        <Kpi label="Waiting for you" icon="alert" value={review.length} foot={`Over ${db.settings.rules.reviewPct}% or ${fmt(db.settings.rules.reviewAbs)}`} />
        <Kpi label="Labels to print" icon="print" value={noTag.length} foot="Items you bring without a tag" />
        <Kpi label="Paused online" icon="layers" value={paused} foot="So nothing sells twice" />
      </div>

      <div className="grid g-main mt">
        <div className="card flush">
          <div className="card-pad card-head" style={{ marginBottom: 0 }}>
            <h2>Check these prices</h2>
            {owner && review.length > 0 && <button className="btn sm primary" onClick={() => attempt(() => approvePrices(review.map((r) => r.item.id)), 'All approved')}>Approve all</button>}
          </div>
          {review.length ? (
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Card</th><th className="r">Was</th><th className="r">Trend now</th><th className="r">New</th><th className="r">Change</th><th /></tr></thead>
              <tbody>{review.map((c) => (
                <tr key={c.item.id}>
                  <td><div className="name">{c.card.name}</div><div className="sub">{c.item.condition} · {c.item.location} · {c.decidedBy}</div></td>
                  <td className="r">{fmt(c.from)}</td><td className="r">{fmt(c.card.market.trend)}</td><td className="r strong">{fmt(c.to)}</td>
                  <td className="r"><Delta pct={pctChange(c.from, c.to)} /></td>
                  <td className="r">{owner ? <button className="btn sm" onClick={() => attempt(() => approvePrices([c.item.id]), 'Approved')}>OK</button> : <span className="faint small">Owner approves</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title="Nothing to check" text="All prices follow your rules." />}
          {auto.length > 0 && <div className="card-pad muted small">{auto.length} smaller change{auto.length > 1 ? 's' : ''} will go through tonight, or when you press Make show ready.</div>}
        </div>

        <div className="card">
          <div className="card-head"><h2>What are you bringing?</h2></div>
          <p className="muted small" style={{ marginTop: 0 }}>Online listings of these items pause during the show and come back after.</p>
          <div className="stack" style={{ gap: 8 }}>
            {locations.map((l) => (
              <label key={l} className="check"><input id={`bring-${l}`} type="checkbox" checked={bring.includes(l)} disabled={!!show?.frozen} onChange={(e) => setBring(e.target.checked ? [...bring, l] : bring.filter((x) => x !== l))} />{l}<span className="faint small">· {db.items.filter((i) => i.location === l && i.status !== 'sold').length}</span></label>
            ))}
          </div>
          <div className="stack mt">
            {show && !show.frozen && owner && <button className="btn primary" onClick={() => { const n = makeShowReady(show.id, bring); toast(`Show ready: ${n} prices updated, prices locked, online listings paused`); }}><Icon name="check" />Make show ready</button>}
            {show?.frozen && <div className="notice"><Icon name="lock" /><div>Prices are locked for {show.name}. They won't change during the show.</div></div>}
            {show?.frozen && owner && <button className="btn" onClick={() => attempt(() => endShow(show.id), 'Show ended: listings back online')}>End show and go back online</button>}
            <button className="btn" disabled={!noTag.length} onClick={() => download('labels.csv', csv([['Card', 'Price', 'Location'], ...noTag.map((i) => [db.cards.find((c) => c.id === i.cardId)!.name, (i.price / 100).toFixed(2), i.location])]))}><Icon name="download" />Labels for {noTag.length} items without a tag</button>
            {!show && <Link className="btn" to="/shows">Pick a show</Link>}
          </div>
        </div>
      </div>
    </Layout>
  );
}
