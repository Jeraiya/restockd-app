import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { me, priceChanges, switchMember, useDB } from '../data/store';
import { Icon } from './Icon';

export const NAV: { to: string; label: string; icon: string; group: string; ownerOnly?: boolean }[] = [
  { to: '/', label: 'Overview', icon: 'dashboard', group: 'Sell' },
  { to: '/inventory', label: 'Inventory', icon: 'box', group: 'Sell' },
  { to: '/pos', label: 'Checkout', icon: 'cart', group: 'Sell' },
  { to: '/show-ready', label: 'Show ready', icon: 'check', group: 'Sell' },
  { to: '/tags', label: 'Tags', icon: 'tag', group: 'Sell' },
  { to: '/channels', label: 'Channels', icon: 'layers', group: 'Sell', ownerOnly: true },
  { to: '/wallet', label: 'Wallet', icon: 'wallet', group: 'Money', ownerOnly: true },
  { to: '/consignment', label: 'Consignment', icon: 'users', group: 'Money', ownerOnly: true },
  { to: '/insights', label: 'Insights', icon: 'chart', group: 'Money', ownerOnly: true },
  { to: '/shows', label: 'Card shows', icon: 'clock', group: 'Community' },
  { to: '/news', label: 'News', icon: 'news', group: 'Community' },
  { to: '/stolen', label: 'Stolen registry', icon: 'shield', group: 'Community' },
  { to: '/pricing', label: 'Pricing rules', icon: 'trending', group: 'Settings', ownerOnly: true },
  { to: '/settings', label: 'Settings', icon: 'settings', group: 'Settings', ownerOnly: true },
];

export function Brand() {
  return <><div className="brand-mark">R</div><div className="brand-name">Restockd<span>.</span></div></>;
}

export function Layout({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const db = useDB();
  const user = me(db);
  const owner = user.role === 'owner';
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const review = priceChanges(db).filter((c) => c.review).length;
  const unread = db.notices.filter((n) => !n.read).length;
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <div className="app">
      <aside className={`side ${open ? 'open' : ''}`}>
        <NavLink to="/" className="brand"><Brand /></NavLink>
        {groups.map((g) => {
          const items = NAV.filter((n) => n.group === g && (owner || !n.ownerOnly));
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="nav-group">{g}</div>
              {items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <Icon name={n.icon} />{n.label}
                  {n.to === '/show-ready' && review > 0 && <span className="nav-count">{review}</span>}
                  {n.to === '/' && unread > 0 && <span className="nav-count">{unread}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div className="spacer" />
        <div className="me">
          <div className="avatar neon">{user.name.slice(0, 2).toUpperCase()}</div>
          <div className="grow">
            <div className="me-name ellipsis">{user.name}</div>
            <small>{owner ? 'Owner' : 'Booth helper'} · {db.settings.vendor.name}</small>
          </div>
          <select className="in member-pick" aria-label="Switch user" value={user.id} onChange={(e) => switchMember(e.target.value)}>
            {db.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </aside>
      {open && <div className="overlay" style={{ zIndex: 30, background: 'rgba(0,0,0,.4)' }} onClick={() => setOpen(false)} />}
      <main className="main">
        <div className="demo-bar">Demo · all data is example data stored in this browser</div>
        <div className="top">
          <button className="btn icon menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
          <h1>{title}{sub && <span className="sub">{sub}</span>}</h1>
          {actions}
        </div>
        <div className="page-in" key={loc.pathname}>{children}</div>
      </main>
    </div>
  );
}
