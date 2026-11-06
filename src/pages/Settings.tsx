import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Field, MoneyInput, attempt, toast } from '../components/ui';
import { priceChanges, resetDemo, setVendorName, updateRules, useDB } from '../data/store';
import { fmt } from '../lib/money';
import { computePrice } from '../lib/pricing';
import type { Condition, Language } from '../lib/types';

export function Pricing() {
  const db = useDB();
  const r = db.settings.rules;
  const changes = priceChanges(db);
  const sample = db.cards.find((c) => c.id === 'c1')!;
  const ex = computePrice({ condition: 'EX', language: 'EN', cost: 6000 }, sample, r, 'show');
  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  return (
    <Layout title="Pricing rules" sub="Set them once. Restockd keeps every price up to date every night.">
      <div className="grid g-main">
        <div className="card">
          <div className="card-head"><h2>Your rules</h2></div>
          <div className="fg">
            <Field label="Base price"><select id="base" className="in" value={r.base} onChange={(e) => updateRules({ base: e.target.value as typeof r.base })}><option value="trend">Cardmarket trend</option><option value="low">Cardmarket lowest</option><option value="avg30">30-day average</option></select></Field>
            <Field label="Bulk: cards worth less than"><MoneyInput id="bulkBelow" value={r.bulkBelow} onChange={(v) => updateRules({ bulkBelow: v })} /></Field>
            <Field label="At the show (%)" help="e.g. −5 for 5% under trend"><input id="showAdj" className="in r" type="number" value={r.showAdjustPct} onChange={(e) => updateRules({ showAdjustPct: num(e.target.value) })} /></Field>
            <Field label="Online, eBay and shop (%)"><input id="onAdj" className="in r" type="number" value={r.onlineAdjustPct} onChange={(e) => updateRules({ onlineAdjustPct: num(e.target.value) })} /></Field>
            <Field label="Never below cost + (%)"><input id="minM" className="in r" type="number" value={r.minMarginPct} onChange={(e) => updateRules({ minMarginPct: num(e.target.value) })} /></Field>
            <Field label="Bulk price"><MoneyInput id="bulkPrice" value={r.bulkPrice} onChange={(v) => updateRules({ bulkPrice: v })} /></Field>
            <Field label="Ask me when a price changes more than (%)"><input id="revPct" className="in r" type="number" value={r.reviewPct} onChange={(e) => updateRules({ reviewPct: num(e.target.value) })} /></Field>
            <Field label="…or more than"><MoneyInput id="revAbs" value={r.reviewAbs} onChange={(v) => updateRules({ reviewAbs: v })} /></Field>
          </div>
          <div className="small muted strong mt" style={{ marginBottom: 8 }}>Condition (% of market price)</div>
          <div className="fg c4">{(Object.keys(r.conditionPct) as Condition[]).map((k) => <Field key={k} label={k}><input id={`cond-${k}`} className="in r" type="number" value={r.conditionPct[k]} onChange={(e) => updateRules({ conditionPct: { ...r.conditionPct, [k]: num(e.target.value) } })} /></Field>)}</div>
          <div className="small muted strong mt" style={{ marginBottom: 8 }}>Language (± %)</div>
          <div className="fg c4">{(Object.keys(r.languagePct) as Language[]).map((k) => <Field key={k} label={k}><input id={`lang-${k}`} className="in r" type="number" value={r.languagePct[k]} onChange={(e) => updateRules({ languagePct: { ...r.languagePct, [k]: num(e.target.value) } })} /></Field>)}</div>
          <p className="muted small">Rounding: under {fmt(r.roundThreshold)} to {fmt(r.roundSmallTo)}, above to {fmt(r.roundLargeTo)}. The price guide gives one price per card, not per condition or language. That's why these percentages exist.</p>
        </div>
        <div className="stack">
          <div className="card glow">
            <div className="card-head"><h2>Example</h2><span className="hint">{sample.name} · EX</span></div>
            <div className="summary">
              {ex.steps.map((s, i) => <div className="li" key={i}><div className="grow">{s.label}</div><div className="num">{fmt(s.value)}</div></div>)}
              <div className="li total"><div className="grow">Show price</div><div className="num">{fmt(ex.price)}</div></div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>Effect on your stock</h2></div>
            <div className="list small">
              <div className="li"><div className="li-main">Prices that would change</div><b>{changes.length}</b></div>
              <div className="li"><div className="li-main">Of which you'll review</div><b>{changes.filter((c) => c.review).length}</b></div>
            </div>
            <p className="muted small">Changes apply tonight at 06:00, or right away from Show ready.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function Settings() {
  const db = useDB();
  const [name, setName] = useState(db.settings.vendor.name);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <Layout title="Settings">
      <div className="grid g-2">
        <div className="card">
          <div className="card-head"><h2>Your business</h2>{db.settings.vendor.verified && <span className="badge pos">Verified</span>}</div>
          <Field label="Vendor name" help="Shown to buyers when they scan your tags."><input id="vname" className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <button className="btn mt" onClick={() => attempt(() => setVendorName(name.trim() || 'Restockd'), 'Saved')}>Save</button>
        </div>
        <div className="card">
          <div className="card-head"><h2>Payments</h2><span className="badge pos">Mollie connected</span></div>
          <p className="muted" style={{ marginTop: 0 }}>Buyers pay into your own Mollie account. Mollie checks your identity and pays out to your bank. Restockd takes {db.settings.commissionPct}% per sale automatically.</p>
          <button className="btn" onClick={() => toast('In the live app this opens Mollie.')}><Icon name="wallet" />Manage in Mollie</button>
        </div>
        <div className="card">
          <div className="card-head"><h2>Team</h2></div>
          <div className="list">{db.members.map((m) => <div className="li" key={m.id}><div className="avatar">{m.name.slice(0, 2).toUpperCase()}</div><div className="li-main"><div className="li-title">{m.name}</div><div className="li-sub">{m.role === 'owner' ? 'Owner: everything' : 'Booth helper: checkout, tags and stock. Discounts limited per card.'}</div></div></div>)}</div>
          <p className="muted small">Switch user at the bottom of the menu to see the helper view.</p>
        </div>
        <div className="card">
          <div className="card-head"><h2>Tags</h2></div>
          <div className="list small">
            <div className="li"><div className="li-main">Tag domain</div><b>{db.settings.tagDomain}</b></div>
            <div className="li"><div className="li-main">Wait time before reuse</div><b>{db.settings.tagCooldownMin ? `${db.settings.tagCooldownMin} min` : 'None (reuse after a physical tap)'}</b></div>
          </div>
          <button className="btn mt" onClick={() => toast('Tag ordering comes with the live app.')}><Icon name="tag" />Order a starter pack</button>
        </div>
        <div className="card">
          <div className="card-head"><h2>Demo data</h2></div>
          <p className="muted" style={{ marginTop: 0 }}>Everything is stored in this browser. Reset to start fresh.</p>
          {confirmReset ? <div className="row"><button className="btn danger" onClick={() => { resetDemo(); setConfirmReset(false); toast('Demo data reset'); }}>Yes, reset</button><button className="btn ghost" onClick={() => setConfirmReset(false)}>Cancel</button></div>
            : <button className="btn" onClick={() => setConfirmReset(true)}>Reset demo data</button>}
        </div>
      </div>
    </Layout>
  );
}
