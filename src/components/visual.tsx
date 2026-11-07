import { ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/**
 * Holographic wallet card with real 3D depth.
 * Tilts towards the pointer, floats gently when idle, and has layers at different depths
 * (foil, logo, amount) so it reads as a physical object.
 */
export function WalletCard3D({ amount, label, sub, owner }: { amount: string; label: string; sub: string; owner: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, tx = -8, ty = 14, cx = tx, cy = ty, hover = false, t = 0;
    const loop = () => {
      t += 0.012;
      if (!hover && !reduce) { tx = -6 + Math.sin(t) * 5; ty = 12 + Math.cos(t * 0.8) * 7; }
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      el.style.setProperty('--rx', `${cx.toFixed(2)}deg`);
      el.style.setProperty('--ry', `${cy.toFixed(2)}deg`);
      el.style.setProperty('--mx', `${50 + cy * 2.2}%`);
      el.style.setProperty('--my', `${50 - cx * 2.6}%`);
      raf = requestAnimationFrame(loop);
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      hover = true; tx = -py * 22; ty = px * 28;
    };
    const leave = () => { hover = false; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, []);
  return (
    <div className="w3d" ref={wrap} aria-label={`${label}: ${amount}`}>
      <div className="w3d-shadow" />
      <div className="w3d-back b2"><span>Elsewhere</span></div>
      <div className="w3d-back b1"><span>On its way</span></div>
      <div className="w3d-card">
        <div className="w3d-foil" />
        <div className="w3d-sheen" />
        <div className="w3d-grain" />
        <div className="w3d-row w3d-z1">
          <div className="w3d-mark">R</div>
          <div className="w3d-nfc"><Icon name="tag" size={16} /></div>
        </div>
        <div className="w3d-z2">
          <div className="w3d-label">{label}</div>
          <div className="w3d-amount">{amount}</div>
          <div className="w3d-sub">{sub}</div>
        </div>
        <div className="w3d-row w3d-z1 w3d-foot">
          <span>{owner}</span>
          <span className="w3d-chip" />
        </div>
      </div>
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
