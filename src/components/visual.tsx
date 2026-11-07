import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/**
 * Holographic wallet card with real 3D depth.
 * - Mouse/pen: the card tilts towards the pointer anywhere over the wallet area.
 * - Touch: tap to flip the card (scrolling keeps working).
 * - Idle: floats gently. Reduced motion: stays still.
 * The stage uses preserve-3d; clipping and blend effects live on a flat inner face,
 * so the logo, amount and chip really sit above the card.
 */
export function WalletCard3D({ amount, label, sub, owner, back }: { amount: string; label: string; sub: string; owner: string; back: { label: string; value: string }[] }) {
  const area = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const flipRef = useRef(false);
  flipRef.current = flipped;
  useEffect(() => {
    const el = area.current, st = stage.current;
    if (!el || !st) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, tx = -6, ty = 12, rx = tx, ry = ty, fl = 0, hover = false, t = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(64, now - last) / 16.7; last = now;
      t += 0.012 * dt;
      if (!hover && !reduce) { tx = -5 + Math.sin(t) * 5; ty = 10 + Math.cos(t * 0.8) * 8; }
      if (reduce && !hover) { tx = -4; ty = 8; }
      const k = 1 - Math.pow(1 - 0.12, dt);
      rx += (tx - rx) * k; ry += (ty - ry) * k;
      fl += ((flipRef.current ? 180 : 0) - fl) * (1 - Math.pow(1 - 0.14, dt));
      st.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${(ry + fl).toFixed(2)}deg)`;
      el.style.setProperty('--mx', `${(50 + ry * 2.4).toFixed(1)}%`);
      el.style.setProperty('--my', `${(50 - rx * 2.8).toFixed(1)}%`);
      el.style.setProperty('--sx', `${(-ry * 1.4).toFixed(1)}px`);
      raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = st.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const px = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 0.75)));
      const py = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 0.75)));
      hover = true; tx = -py * 16; ty = px * 22;
    };
    const leave = () => { hover = false; };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, []);
  return (
    <div className="w3d-area" ref={area}>
      <button type="button" className="w3d" onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} aria-label={`${label}: ${amount}. Tap to flip.`}>
        <div className="w3d-shadow" />
        <div className="w3d-stage" ref={stage}>
          <div className="w3d-back b2" />
          <div className="w3d-back b1" />
          <div className="w3d-front">
            <div className="w3d-face">
              <div className="w3d-foil" />
              <div className="w3d-sheen" />
              <div className="w3d-grain" />
            </div>
            <div className="w3d-layer w3d-top"><div className="w3d-mark">R</div><div className="w3d-nfc"><Icon name="tag" size={16} /></div></div>
            <div className="w3d-layer w3d-mid"><div className="w3d-label">{label}</div><div className="w3d-amount">{amount}</div><div className="w3d-sub">{sub}</div></div>
            <div className="w3d-layer w3d-bot"><span>{owner}</span><span className="w3d-chip" /></div>
          </div>
          <div className="w3d-rear">
            <div className="w3d-face rear" />
            <div className="w3d-layer w3d-rear-in">
              {back.map((b) => <div key={b.label} className="w3d-rear-row"><span>{b.label}</span><b>{b.value}</b></div>)}
              <div className="w3d-rear-hint">Click to flip back</div>
            </div>
          </div>
        </div>
      </button>
      <div className="w3d-hint">Click or tap the card to flip it</div>
    </div>
  );
}

/** Small area sparkline. */
export function Spark({ data, height = 44, color = '#e6ff00' }: { data: number[]; height?: number; color?: string }) {
  const w = 160;
  if (data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 4 - ((v - min) / span) * (height - 8)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const id = `sp${Math.round(data[0] * 7 + data.length)}`;
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

/** Circular progress with a value in the middle. */
export function Ring({ pct, size = 112, children }: { pct: number; size?: number; children: ReactNode }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6ff00" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(c * Math.min(100, Math.max(0, pct))) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: 'drop-shadow(0 0 8px rgba(230,255,0,.45))' }} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

export function QuickAction({ to, icon, title, sub, accent }: { to: string; icon: string; title: string; sub: string; accent?: boolean }) {
  return (
    <Link to={to} className={`qa ${accent ? 'accent' : ''}`}>
      <span className="qa-ico"><Icon name={icon} size={22} /></span>
      <span className="qa-t">{title}</span>
      <span className="qa-s">{sub}</span>
      <span className="qa-go"><Icon name="up" size={16} /></span>
    </Link>
  );
}

const HUES: Record<string, [string, string, string]> = {
  'Pokémon': ['#ffcb3d', '#ff7a59', '#6d8dff'],
  Magic: ['#c26dff', '#6d8dff', '#3ddc84'],
  'Yu-Gi-Oh!': ['#ff5a5f', '#ffb020', '#c26dff'],
  'One Piece': ['#ff7a59', '#ffcb3d', '#57d4a9'],
  Lorcana: ['#6d8dff', '#57d4a9', '#e6ff00'],
};
/** A tiny holographic trading card used as thumbnail. */
export function HoloThumb({ game, kind, label, size = 40 }: { game: string; kind: string; label?: string; size?: number }) {
  const [a, b, c] = HUES[game] ?? HUES['Pokémon'];
  return (
    <div className={`holo-thumb ${kind}`} style={{ width: size * 0.74, height: size, ['--a' as string]: a, ['--b' as string]: b, ['--c' as string]: c }}>
      {label && <span>{label}</span>}
    </div>
  );
}

/** Money with smaller, lighter decimals: €1,234.56 */
export function Money({ cents, className }: { cents: number; className?: string }) {
  const s = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const i = s.lastIndexOf('.');
  return <span className={className}>{i > 0 ? <>{s.slice(0, i)}<span className="money-d">{s.slice(i)}</span></> : s}</span>;
}

/** Donut with rounded segments; the last segment is hatched. */
export function Donut({ parts, size = 210, children }: { parts: { value: number; color: string; hatch?: boolean }[]; size?: number; children?: ReactNode }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = size / 2 - 18, c = 2 * Math.PI * r, gap = 10;
  let off = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="#1c1c1f" /><rect width="3" height="7" fill="#4a4a50" />
          </pattern>
        </defs>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {parts.map((p, i) => {
            const len = Math.max(0, (p.value / total) * c - gap);
            const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.hatch ? 'url(#hatch)' : p.color} strokeWidth={26} strokeLinecap="round" strokeDasharray={`${len} ${c}`} strokeDashoffset={-off} />;
            off += (p.value / total) * c;
            return el;
          })}
        </g>
      </svg>
      <div className="donut-in">{children}</div>
    </div>
  );
}

/** Tile with a big tilted visual, like a promo card. */
export function PromoTile({ to, title, tone, visual }: { to: string; title: ReactNode; tone: 'lime' | 'black'; visual: ReactNode }) {
  return (
    <Link to={to} className={`promo ${tone}`}>
      <div className="promo-visual">{visual}</div>
      <div className="promo-title">{title}</div>
      <span className="promo-go"><Icon name="up" size={15} /></span>
    </Link>
  );
}

export interface StackCard { key: string; label: string; amount: number; sub: string; tone: 'lime' | 'silver' | 'blue' | 'graphite'; trend?: number }
/**
 * Wallet with stacked cards. The front card shows the full balance; the cards behind
 * peek out with their label and amount. Tap a card behind to bring it to the front.
 */
export function WalletStack({ cards }: { cards: StackCard[] }) {
  const [order, setOrder] = useState(cards.map((c) => c.key));
  useEffect(() => { setOrder((o) => (o.length === cards.length ? o : cards.map((c) => c.key))); }, [cards]);
  const n = cards.length;
  const PEEK = 38;
  return (
    <div className="wstack" style={{ paddingTop: (n - 1) * PEEK }}>
      {cards.map((c) => {
        const pos = order.indexOf(c.key); // 0 = front
        const depth = pos;
        const style = {
          transform: `translateY(${-depth * PEEK}px) scale(${1 - depth * 0.045})`,
          zIndex: n - depth,
        } as React.CSSProperties;
        const front = pos === 0;
        return (
          <button key={c.key} type="button" className={`wcard ${c.tone} ${front ? 'front' : 'behind'}`} style={style}
            onClick={() => !front && setOrder([c.key, ...order.filter((k) => k !== c.key)])}
            aria-label={front ? `${c.label}: ${(c.amount / 100).toFixed(2)} euro` : `Show ${c.label}`}>
            <div className="wcard-tab"><span>{c.label}</span><Money cents={c.amount} /></div>
            <div className="wcard-body">
              <div className="wcard-top"><span className="wcard-mark">R</span><span className="wcard-chip" /></div>
              <div className="wcard-label">{c.label}</div>
              <div className="wcard-row">
                <Money cents={c.amount} className="wcard-amount" />
                {c.trend != null && <span className={`wcard-trend ${c.trend >= 0 ? 'up' : 'down'}`}>{c.trend >= 0 ? '↑' : '↓'} {Math.abs(c.trend).toFixed(1)}%</span>}
              </div>
              <div className="wcard-sub">{c.sub}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
