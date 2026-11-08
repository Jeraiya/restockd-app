import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Layout } from '../components/Layout';
import { Field, Modal, Seg, attempt } from '../components/ui';
import { TapResult, activateTag, cardOf, itemName, linkTag, setTagStatus, tapTag, unlinkTag, useDB } from '../data/store';
import { fmt, fmtTime } from '../lib/money';
import type { Tag } from '../lib/types';

const STATUS: Record<Tag['status'], { label: string; cls: string }> = {
  stock: { label: 'In stock', cls: '' }, shipped: { label: 'Not activated', cls: 'warn' }, active: { label: 'Linked', cls: 'pos' },
  free: { label: 'Free', cls: 'neon' }, lost: { label: 'Lost', cls: 'neg' }, given: { label: 'With buyer', cls: '' },
};

export function Tags() {
  const db = useDB();
  const mine = db.tags.filter((t) => t.ownerId === db.settings.vendor.id);
  const [filter, setFilter] = useState<'all' | Tag['status']>('all');
  const [tap, setTap] = useState<TapResult | null>(null);
  const [code, setCode] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const rows = mine.filter((t) => filter === 'all' || t.status === filter);
  const doTap = (c: string) => { setTap(tapTag(c)); setCode(''); };

  return (
    <Layout title="Tags" sub={`${mine.filter((t) => t.status === 'active').length} linked · ${mine.filter((t) => t.status === 'free').length} free · ${db.settings.tagDomain}`}>
      <div className="grid g-main">
        <div className="card glow">
          <div className="card-head"><h2>Tap a tag</h2><span className="hint">Hold a tag to your phone</span></div>
          <p className="muted" style={{ marginTop: 0 }}>In the app you hold a tag to your phone. Here you type the code printed on the tag.</p>
          <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (code.trim()) doTap(code); }}>
            <input id="tap-code" className="in" style={{ maxWidth: 260 }} placeholder="e.g. 04A3F2C2" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn primary" type="submit"><Icon name="tag" />Tap</button>
          </form>
          <div className="row wrap mt small muted">Try: {['04A3F2C2', '04B7A001', '04A3F2B1', '04FF0001', '04A3F2C4', 'ZZ999999'].map((c) => <button key={c} className="btn sm" onClick={() => doTap(c)}>{c}</button>)}</div>
        </div>
        <div className="card">
          <div className="card-head"><h2>How your tags are protected</h2></div>
          <div className="list small">
            <div className="li"><Icon name="lock" /><div className="li-main">Locked at the factory. Nobody can rewrite the link.</div></div>
            <div className="li"><Icon name="users" /><div className="li-main">Each tag belongs to your account. Other vendors can't reset or take it.</div></div>
            <div className="li"><Icon name="shield" /><div className="li-main">NTAG 424 tags create a new secure code on every scan, so copies are detected.</div></div>
            <div className="li"><Icon name="alert" /><div className="li-main">A sticker can be peeled off. For slabs the cert number is the real protection.</div></div>
          </div>
        </div>
      </div>

      <div className="row wrap mt" style={{ marginBottom: 12 }}>
        <Seg value={filter} onChange={setFilter} options={[{ key: 'all', label: 'All' }, { key: 'active', label: 'Linked' }, { key: 'free', label: 'Free' }, { key: 'shipped', label: 'Not activated' }, { key: 'lost', label: 'Lost' }, { key: 'given', label: 'With buyer' }]} />
      </div>
      <div className="tag-grid">
        {rows.map((t) => {
          const it = t.itemId ? db.items.find((i) => i.id === t.itemId) : undefined;
          return (
            <button key={t.id} className={`tag-card st-${t.status}`} onClick={() => setDetail(t.id)}>
              <div className="row between"><span className="tag-disc"><span>R</span></span><span className={`badge ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span></div>
              <div className="tag-id">{t.id}</div>
              <div className="tag-link ellipsis">{it ? itemName(db, it) : t.location ?? (t.status === 'shipped' ? 'Tap to activate' : t.status === 'free' ? 'Ready to link' : '—')}</div>
              {it && <div className="tag-price">{fmt(it.price)}</div>}
              <div className="row between small"><span className="muted">{t.chip === 'NTAG424' ? 'Secure chip' : 'Standard chip'}</span><span className="muted">{t.scans} scans</span></div>
            </button>
          );
        })}
      </div>
      <p className="muted small">Need more tags? Starter packs ship within the Netherlands as a letterbox parcel. Order in Settings.</p>

      {tap && <TapModal result={tap} onClose={() => setTap(null)} />}
      {detail && <TagModal id={detail} onClose={() => setDetail(null)} />}
    </Layout>
  );
}

function LinkPicker({ tagId, onDone }: { tagId: string; onDone: () => void }) {
  const db = useDB();
  const [mode, setMode] = useState<'card' | 'location'>('card');
  const free = db.items.filter((i) => i.status === 'in_stock' && !db.tags.some((t) => t.itemId === i.id && t.status === 'active'));
  const [itemId, setItemId] = useState(free[0]?.id ?? '');
  const [loc, setLoc] = useState('Binder 1');
  return (
    <div className="stack">
      <Seg value={mode} onChange={setMode} options={[{ key: 'card', label: 'A card' }, { key: 'location', label: 'A binder or case' }]} />
      {mode === 'card'
        ? <Field label="Card without a tag"><select id="pick-item" className="in" value={itemId} onChange={(e) => setItemId(e.target.value)}>{free.map((i) => <option key={i.id} value={i.id}>{itemName(db, i)} · {fmt(i.price)} · {i.location}</option>)}</select></Field>
        : <Field label="Binder or case" help="Buyers see every card in it, sorted by value."><select id="pick-loc" className="in" value={loc} onChange={(e) => setLoc(e.target.value)}>{['Binder 1', 'Binder 2', 'Binder 3', 'Display case', 'Slab case'].map((l) => <option key={l}>{l}</option>)}</select></Field>}
      <button className="btn primary" disabled={mode === 'card' && !itemId} onClick={() => attempt(() => { linkTag(tagId, mode === 'card' ? { itemId } : { location: loc }); onDone(); }, 'Tag linked. Buyers see the new price right away.')}>Link tag</button>
    </div>
  );
}

function TapModal({ result, onClose }: { result: TapResult; onClose: () => void }) {
  const db = useDB();
  if (result.type === 'unknown') return <Modal title="Not a genuine Restockd tag" onClose={onClose} size="narrow"><div className="notice warn"><Icon name="alert" /><div>Tag {result.code} is not in our list of tags we produced, or it isn't locked. Don't trust a price behind it.</div></div></Modal>;
  if (result.type === 'other') return <Modal title={`This tag belongs to ${result.owner}`} onClose={onClose} size="narrow"><p className="muted">You can't link, reset or take over another vendor's tag. Only the owner can transfer it, and you would have to confirm. This scan was saved in the tag history.</p></Modal>;
  const t = db.tags.find((x) => x.id === result.tag.id)!;
  if (result.type === 'activate' && t.status === 'shipped') return (
    <Modal title={`New tag ${t.id}`} sub={`From your order #${t.orderId}`} onClose={onClose} size="narrow">
      <p className="muted">This tag is not activated yet. Add it to your account?</p>
      <button className="btn primary" onClick={() => attempt(() => activateTag(t.id), 'Tag activated')}>Add to my account</button>
    </Modal>
  );
  if (t.status === 'lost' || t.status === 'given') return (
    <Modal title={`Tag ${t.id} is marked as ${t.status === 'lost' ? 'lost' : 'with a buyer'}`} onClose={onClose} size="narrow">
      <p className="muted">Found it again? Mark it as found and you can use it like any other free tag.</p>
      <button className="btn" onClick={() => attempt(() => setTagStatus(t.id, 'free'), 'Marked as found')}>Mark as found</button>
    </Modal>
  );
  if (t.status === 'free') {
    const prev = result.type === 'link' ? result.previous : undefined;
    return (
      <Modal title={`Free tag ${t.id}`} sub={prev ? `Was on ${cardOf(db, prev).name} (sold)` : 'Ready to use'} onClose={onClose} size="narrow">
        <LinkPicker tagId={t.id} onDone={onClose} />
      </Modal>
    );
  }
  const it = t.itemId ? db.items.find((i) => i.id === t.itemId) : undefined;
  return (
    <Modal title={`Tag ${t.id}`} sub={it ? `${itemName(db, it)} · ${fmt(it.price)}` : t.location} onClose={onClose} size="narrow">
      <div className="stack">
        <Link className="btn" to={`/t/${t.id}`}><Icon name="eye" />See what buyers see</Link>
        <button className="btn" onClick={() => attempt(() => unlinkTag(t.id), 'Unlinked')}>Unlink so you can reuse it</button>
      </div>
    </Modal>
  );
}

function TagModal({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useDB();
  const t = db.tags.find((x) => x.id === id)!;
  return (
    <Modal title={`Tag ${t.id}`} sub={`${t.chip} · ${t.locked ? 'locked' : 'not locked'} · https://${db.settings.tagDomain}/t/${t.id}`} onClose={onClose}>
      <div className="stack">
        <div className="row wrap">
          {t.status === 'active' && <Link className="btn" to={`/t/${t.id}`}><Icon name="eye" />Buyer view</Link>}
          {(t.status === 'active' || t.status === 'free') && <button className="btn" onClick={() => attempt(() => setTagStatus(t.id, 'lost'), 'Marked as lost: you get an alert on every scan')}><Icon name="alert" />Mark as lost</button>}
          {(t.status === 'lost' || t.status === 'given') && <button className="btn" onClick={() => attempt(() => setTagStatus(t.id, 'free'), 'Marked as found')}>Mark as found</button>}
          {t.status === 'active' && <button className="btn" onClick={() => attempt(() => unlinkTag(t.id), 'Unlinked')}>Unlink</button>}
        </div>
        {t.status === 'free' && <LinkPicker tagId={t.id} onDone={onClose} />}
        <div>
          <div className="small muted strong" style={{ marginBottom: 6 }}>History</div>
          <div className="list">{[...t.history].reverse().map((h, i) => <div className="li small" key={i}><div className="li-main">{h.text}</div><div className="li-end muted">{fmtTime(h.at)}</div></div>)}</div>
        </div>
      </div>
    </Modal>
  );
}
