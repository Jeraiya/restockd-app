import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { markNoticeRead, markNoticesRead, me, priceChanges, switchMember, useDB } from '../data/store';
import { fmtTime } from '../lib/money';
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
  const [bell, setBell] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); setBell(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const review = priceChanges(db).filter((c) => c.review).length;
  const unread = db.notices.filter((n) => !n.read).length;
  const groups = [...new Set(NAV.map((n) => n.group))];
  const tab = (to: string, icon: string, label: string) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}><Icon name={icon} size={20} />{label}</NavLink>
  );
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
      {open && <div className="overlay" style={{ zIndex: 30 }} onClick={() => setOpen(false)} />}
      <main className="main">
        <div className="top">
          <button className="btn icon menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
          <h1>{title}{sub && <span className="sub">{sub}</span>}</h1>
          <div className="top-tools">
            {actions}
            <span className="demo-bar hide-m">Demo data</span>
            <Link className="round-btn hide-m" to="/inventory" aria-label="Search stock"><Icon name="search" /></Link>
            <div className="bell-wrap">
              <button className="round-btn" onClick={() => setBell(!bell)} aria-label="Notifications" aria-expanded={bell}><Icon name="alert" />{unread > 0 && <span className="dot-red" />}</button>
              {bell && (
                <div className="bell-panel" role="dialog" aria-label="Notifications">
                  <div className="row between"><b>Notifications</b>{unread > 0 && <button className="link-btn" onClick={markNoticesRead}>Mark all as read</button>}</div>
                  {db.notices.length === 0 && <div className="muted small">Nothing new.</div>}
                  {db.notices.slice(0, 6).map((n) => (
                    <Link key={n.id} to={n.kind === 'stolen' ? '/stolen' : n.kind === 'lost' ? '/tags' : n.kind === 'price' ? '/show-ready' : '/'} className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => markNoticeRead(n.id)}>
                      <span className={`bell-ico ${n.kind}`}><Icon name={n.kind === 'stolen' ? 'shield' : n.kind === 'lost' ? 'tag' : n.kind === 'price' ? 'trending' : 'info'} size={15} /></span>
                      <span className="grow"><span className="bell-text">{n.text}</span><span className="muted small">{fmtTime(n.at)}</span></span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="page-in" key={loc.pathname}>{children}</div>
      </main>
      <nav className="tabbar" aria-label="Quick menu">
        {tab('/', 'dashboard', 'Home')}
        {tab('/inventory', 'box', 'Stock')}
        <NavLink to="/pos" className="tab sell" aria-label="Sell"><Icon name="cart" size={22} /></NavLink>
        {tab('/tags', 'tag', 'Tags')}
        <button className="tab" onClick={() => setOpen(true)}><Icon name="menu" size={20} />More</button>
      </nav>
    </div>
  );
}
