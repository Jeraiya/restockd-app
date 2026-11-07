import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Empty, Field, Modal, attempt } from '../components/ui';
import { approveReport, checkCert, resolveStolen, reportStolen, useDB } from '../data/store';
import { fmtDate, fmtTime } from '../lib/money';
import type { HitKind, ProofKind, StolenReport } from '../lib/types';

const STEPS = [
  { n: 1, who: 'You', time: '2 minutes', title: 'Report', text: 'Enter the certificate number, when and where it was stolen, your police report number and proof that it is yours.' },
  { n: 2, who: 'Restockd', time: 'Within 24 hours', title: 'Review', text: 'We check that the cert exists at the grader, that your proof is valid and that nobody reported it before. Nothing is flagged yet.' },
  { n: 3, who: 'Restockd', time: 'Until resolved', title: 'Watched', text: 'The cert is flagged worldwide. Every intake, purchase, buyer scan and public check in Restockd is matched against it.' },
  { n: 4, who: 'Everyone', time: 'Instantly', title: 'Hit', text: 'The person with the slab is warned not to buy or sell it. You get an alert. We save the details for the police.' },
  { n: 5, who: 'You', time: 'When it is back', title: 'Resolved', text: 'Got it back or the case is closed? Mark it as resolved and the cert is no longer flagged.' },
];

const WATCH: { label: string; text: string; live: boolean; icon: string }[] = [
  { label: 'Vendor intake', text: 'A vendor scans a slab into their Restockd stock. Blocked if stolen.', live: true, icon: 'box' },
  { label: 'Buying from the public', text: 'A vendor uses the buy calculator at their booth. Blocked if stolen.', live: false, icon: 'cart' },
  { label: 'Buyer scans a slab tag', text: 'A buyer opens the tag page of a slab. The page shows a warning.', live: true, icon: 'tag' },
  { label: 'Public check page', text: 'Anyone checks a cert before buying, no account needed.', live: true, icon: 'search' },
  { label: 'eBay listings', text: 'Listings that mention a flagged cert number.', live: false, icon: 'layers' },
  { label: 'Graders and card shows', text: 'Partners who check certs at grading intake or at the door.', live: false, icon: 'users' },
];

const HIT_ICON: Record<HitKind, string> = { intake: 'box', check: 'search', scan: 'tag', listing: 'layers' };
const STATUS: Record<StolenReport['status'], { label: string; cls: string }> = {
  review: { label: 'In review', cls: 'warn' }, active: { label: 'Watched', cls: 'neon' }, resolved: { label: 'Resolved', cls: 'pos' }, rejected: { label: 'Rejected', cls: 'neg' },
};

export function Stolen() {
  const db = useDB();
  const [cert, setCert] = useState('');
  const [result, setResult] = useState<ReturnType<typeof checkCert> | null>(null);
  const [reporting, setReporting] = useState(false);
  const mine = db.stolen.filter((r) => r.mine);
  return (
    <Layout title="Stolen registry" sub="Worldwide alerts on the certificate numbers of graded cards" actions={<button className="btn primary" onClick={() => setReporting(true)}><Icon name="shield" />Report a stolen slab</button>}>
      {/* How it works */}
      <section className="card">
        <div className="card-head"><h2>How it works</h2><span className="hint">For graded slabs with a certificate number</span></div>
        <div className="steps5">
          {STEPS.map((s) => (
            <div key={s.n} className="step5">
              <div className="step5-n">{s.n}</div>
              <div className="step5-title">{s.title}</div>
              <div className="step5-meta"><span>{s.who}</span><span>{s.time}</span></div>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        <div className="notice mt"><Icon name="info" /><div>An NFC sticker can be peeled off, a certificate number can't. That's why the registry works on cert numbers. Raw cards without a slab can't be identified reliably and are not part of the registry.</div></div>
      </section>

      <div className="grid g-main mt top-align">
        {/* Check */}
        <section className="card dark">
          <div className="card-head"><h2>Check a certificate</h2><span className="badge neon">Free for everyone</span></div>
          <p className="muted" style={{ marginTop: 0 }}>Buying a slab? Check it first. It takes five seconds.</p>
          <form className="row wrap" onSubmit={(e) => { e.preventDefault(); setResult(checkCert(cert)); }}>
            <input id="check-cert" className="in" style={{ maxWidth: 280, background: 'rgba(255,255,255,.08)', color: '#fff', borderColor: 'rgba(255,255,255,.15)' }} placeholder="Cert number, e.g. 4011982033" value={cert} onChange={(e) => { setCert(e.target.value); setResult(null); }} />
            <button className="btn lime" type="submit">Check</button>
          </form>
          {result && (result.stolen
            ? <div className="check-res bad"><Icon name="alert" /><div><b>Reported stolen. Don't buy it.</b><br />Don't confront the seller. Walk away and, if you want, tell the organiser. The owner gets an alert of this check (without your name), and we save it for the police.</div></div>
            : <div className="check-res ok"><Icon name="check" /><div><b>Not reported in Restockd.</b><br />That's a good sign, not a guarantee. Also check the cert on the grader's own website.</div></div>)}
          <div className="row wrap mt small"><span className="muted">Try:</span>{['4011982033', '61234987', '84721956'].map((c) => <button key={c} className="btn sm try" onClick={() => { setCert(c); setResult(checkCert(c)); }}>{c}</button>)}</div>
          <div className="results-key">
            <div><span className="dot bad" /><div><b>Reported stolen</b><br /><span className="muted">An active report with a police reference. Don't buy it.</span></div></div>
            <div><span className="dot ok" /><div><b>Not reported</b><br /><span className="muted">No active report in Restockd. Still check the grader's website.</span></div></div>
            <div><span className="dot rev" /><div><b>Reports in review don't show yet</b><br /><span className="muted">Only checked reports count, so nobody gets flagged by mistake.</span></div></div>
          </div>
          <div className="muted small mt">Buyers can use the public page without an account: <Link to="/check" className="w">open check page</Link></div>
        </section>

        {/* Where we watch */}
        <section className="card">
          <div className="card-head"><h2>Where we watch</h2></div>
          <div className="pills">
            {WATCH.map((w) => (
              <div key={w.label} className="prow">
                <span className="li-ico"><Icon name={w.icon} size={16} /></span>
                <div className="grow"><div className="li-title">{w.label}</div><div className="li-sub">{w.text}</div></div>
                <span className={`badge ${w.live ? 'pos' : ''}`}>{w.live ? 'Live' : 'Planned'}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Your reports */}
      <section className="mt">
        <div className="row between" style={{ margin: '8px 0 12px' }}><h2 style={{ fontWeight: 400, fontSize: 24 }}>Your reports</h2></div>
        {mine.length ? <div className="grid g-2">{mine.map((r) => <ReportCard key={r.id} r={r} />)}</div>
          : <div className="card"><Empty title="No reports" text="Hopefully it stays that way." /></div>}
      </section>

      {/* What happens at a hit */}
      <section className="card mt">
        <div className="card-head"><h2>What happens at a hit</h2></div>
        <div className="grid g-3">
          <div className="hit-col"><div className="hit-h"><Icon name="users" />The person with the slab</div><ul>
            <li>Sees: <b>"Reported stolen. Don't buy or sell it."</b></li>
            <li>Never sees your name or contact details.</li>
            <li>A vendor can't add it to stock, sell it via Restockd or link a tag to it.</li>
            <li>Bought it in good faith? They can object with proof of purchase.</li>
          </ul></div>
          <div className="hit-col"><div className="hit-h"><Icon name="alert" />You, the owner</div><ul>
            <li>Get an alert straight away: when, what kind of hit and the city or region.</li>
            <li>See every hit in the timeline of your report.</li>
            <li>Give your police report number to the police. They can ask us for the details.</li>
            <li>Never confront anyone yourself.</li>
          </ul></div>
          <div className="hit-col"><div className="hit-h"><Icon name="shield" />Restockd</div><ul>
            <li>Saves time, place, type of hit and the account involved.</li>
            <li>Shares those details only with the police, on request and with your report number.</li>
            <li>Does not decide who owns the slab. The police and courts do.</li>
            <li>Blocks accounts that make false reports.</li>
          </ul></div>
        </div>
      </section>

      {/* FAQ */}
      <section className="card mt">
        <div className="card-head"><h2>Questions</h2></div>
        <div className="faq2">
          {[
            ['Why do I need a police report?', 'It stops people from flagging someone else\'s slab out of spite or to block a sale. No police report number, no report.'],
            ['What counts as proof that it\'s mine?', 'The easiest proof is that the slab was in your Restockd inventory. Otherwise a purchase invoice, or a photo of the slab with your booth or collection taken before the theft.'],
            ['Will you tell me who has my slab?', 'No. We tell you when and roughly where it was seen. The identity of the person goes to the police only, on their request.'],
            ['What if the slab is already in another vendor\'s stock when I report it?', 'It\'s frozen in their stock during the review. If the report is approved, the vendor is informed and the slab stays blocked until the police or the two of you sort it out.'],
            ['I bought a slab that turns out to be stolen. Now what?', 'Don\'t sell it on. Use "Object" in the warning and add your proof of purchase. Restockd doesn\'t take anything away; the police handle the rest.'],
            ['How long does a report stay active?', 'Twelve months. We remind you before it expires so you can extend it with one click.'],
            ['Can the grading company block the cert too?', 'Some graders can flag a certificate after a theft. Send them your police report as well. We help you with the steps.'],
          ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
        <p className="muted small">The registry rules still have to be checked by a lawyer before launch (privacy law, false reports, objections).</p>
      </section>

      {reporting && <ReportModal onClose={() => setReporting(false)} />}
    </Layout>
  );
}

function ReportCard({ r }: { r: StolenReport }) {
  const st = STATUS[r.status];
  return (
    <div className="card report">
      <div className="row between"><b className="report-name">{r.cardName}</b><span className={`badge ${st.cls}`}>{st.label}</span></div>
      <div className="muted small">{r.grader} cert {r.cert} · police ref {r.policeRef}{r.stolenWhere ? ` · ${r.stolenWhere}` : ''}</div>

      <div className="progress5">
        {['Reported', 'Review', 'Watched', 'Hit', 'Resolved'].map((label, i) => {
          const reached = i === 0 || (i === 1) || (i === 2 && (r.status === 'active' || r.status === 'resolved')) || (i === 3 && r.hits.length > 0) || (i === 4 && r.status === 'resolved');
          return <div key={label} className={`p5 ${reached ? 'on' : ''}`}><span />{label}</div>;
        })}
      </div>

      {r.status === 'review' && (
        <div className="next"><b>What happens now</b><p>We check the cert at {r.grader}, your proof and your police reference. This usually takes less than 24 hours. Until then nothing is flagged.</p>
          {r.heldByVendor && <p className="warn-text">This slab is in another vendor's stock right now. It is frozen there during the review.</p>}
          <button className="btn sm" onClick={() => attempt(() => approveReport(r.id), 'Review approved: the cert is now watched worldwide')}>Approve review (demo only)</button></div>
      )}
      {r.status === 'active' && r.hits.length === 0 && (
        <div className="next"><b>We're watching</b><p>You get an alert as soon as this cert shows up anywhere in Restockd. You don't have to do anything.</p></div>
      )}
      {r.status === 'active' && r.hits.length > 0 && (
        <div className="next hit"><b>{r.hits.length} hit{r.hits.length > 1 ? 's' : ''}: what to do now</b>
          <ol><li>Call the police and mention report <b>{r.policeRef}</b> and that Restockd has hit details.</li><li>Don't contact or confront anyone yourself.</li><li>The slab is blocked in Restockd, so it can't be sold through us.</li></ol></div>
      )}

      {r.hits.length > 0 && <div className="pills">{r.hits.map((h, i) => (
        <div key={i} className="prow"><span className="li-ico hit-ico"><Icon name={HIT_ICON[h.kind]} size={16} /></span><div className="grow"><div className="li-title">{h.where}</div><div className="li-sub">{fmtTime(h.at)} · {h.kind}</div></div></div>
      ))}</div>}

      <details className="timeline"><summary>Timeline ({r.events.length})</summary>
        <ul>{r.events.map((e, i) => <li key={i}><span className="muted small">{fmtTime(e.at)}</span>{e.text}</li>)}</ul>
      </details>
      <div className="row between"><span className="muted small">Reported {fmtDate(r.reportedAt)} · active for 12 months</span>
        {(r.status === 'active' || r.status === 'review') && <button className="btn sm" onClick={() => attempt(() => resolveStolen(r.id), 'Marked as resolved')}>I got it back</button>}</div>
    </div>
  );
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ grader: 'PSA', cert: '', cardName: '', stolenOn: '', stolenWhere: '', policeRef: '', proof: 'inventory' as ProofKind, confirmed: false });
  const [file, setFile] = useState('');
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  const canNext = step === 1 ? /^\d{6,12}$/.test(f.cert.trim()) && f.cardName.trim().length > 2 : step === 2 ? f.policeRef.trim().length > 3 : f.confirmed;
  return (
    <Modal title="Report a stolen slab" sub={`Step ${step} of 3 · ${['The slab', 'The theft', 'Proof and confirmation'][step - 1]}`} onClose={onClose}
      foot={<>
        {step > 1 && <button className="btn ghost" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 3 ? <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next</button>
          : <button className="btn primary" disabled={!canNext} onClick={() => attempt(() => { reportStolen(f); onClose(); }, 'Report submitted. We review it within 24 hours.')}>Submit report</button>}
      </>}>
      <div className="wizard-bar"><span style={{ width: `${(step / 3) * 100}%` }} /></div>
      {step === 1 && <div className="fg">
        <Field label="Grader"><select id="r-grader" className="in" value={f.grader} onChange={(e) => set('grader', e.target.value)}>{['PSA', 'CGC', 'BGS', 'SGC', 'TAG'].map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Certificate number" help="As printed on the label, digits only"><input id="r-cert" className="in" inputMode="numeric" value={f.cert} onChange={(e) => set('cert', e.target.value)} /></Field>
        <Field label="Card" className="full"><input id="r-card" className="in" value={f.cardName} onChange={(e) => set('cardName', e.target.value)} placeholder="e.g. Charizard 4/102 Base Set (PSA 8)" /></Field>
      </div>}
      {step === 2 && <div className="fg">
        <Field label="Date of the theft"><input id="r-date" className="in" type="date" value={f.stolenOn} onChange={(e) => set('stolenOn', e.target.value)} /></Field>
        <Field label="Where"><input id="r-where" className="in" value={f.stolenWhere} onChange={(e) => set('stolenWhere', e.target.value)} placeholder="e.g. Card Show Utrecht, from the booth" /></Field>
        <Field label="Police report number" className="full" help="Required. File a report with the police first (in the Netherlands also possible online)."><input id="r-police" className="in" value={f.policeRef} onChange={(e) => set('policeRef', e.target.value)} placeholder="e.g. NL-2026-118843" /></Field>
      </div>}
      {step === 3 && <div className="stack">
        <div className="small muted strong">Proof that it is yours</div>
        {([['inventory', 'It was in my Restockd inventory', 'Fastest: we already have the cert, date and photo.'], ['invoice', 'Purchase invoice or receipt', 'From a shop, auction or another seller.'], ['photo', 'Photo from before the theft', 'The slab with your booth, collection or name visible.']] as [ProofKind, string, string][]).map(([k, t, d]) => (
          <label key={k} className={`user-pick ${f.proof === k ? 'on' : ''}`}><input id={`proof-${k}`} type="radio" name="proof" checked={f.proof === k} onChange={() => set('proof', k)} /><div><div className="strong">{t}</div><div className="small muted">{d}</div></div></label>
        ))}
        {f.proof !== 'inventory' && <Field label="Upload" help={file ? `Selected: ${file}` : 'PDF or photo. In this demo the file is not uploaded.'}><input id="r-file" className="in" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0]?.name ?? '')} /></Field>}
        <label className="check"><input id="r-confirm" type="checkbox" checked={f.confirmed} onChange={(e) => set('confirmed', e.target.checked)} />I confirm this is correct. I understand that false reports lead to my account being blocked.</label>
      </div>}
    </Modal>
  );
}
