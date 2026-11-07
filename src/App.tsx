import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toasts } from './components/ui';
import { isOwner, useDB } from './data/store';
import { Checkout } from './pages/Checkout';
import { News, Shows } from './pages/Community';
import { Stolen } from './pages/Stolen';
import { Inventory } from './pages/Inventory';
import { Channels, Consignment, Insights, Wallet } from './pages/Money';
import { Overview } from './pages/Overview';
import { CheckPage, TagPage } from './pages/Public';
import { Pricing, Settings } from './pages/Settings';
import { ShowReady } from './pages/ShowReady';
import { Tags } from './pages/Tags';

export function App() {
  const db = useDB();
  const owner = isOwner(db);
  const guard = (el: JSX.Element) => (owner ? el : <Navigate to="/" replace />);
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/pos" element={<Checkout />} />
        <Route path="/show-ready" element={<ShowReady />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/channels" element={guard(<Channels />)} />
        <Route path="/wallet" element={guard(<Wallet />)} />
        <Route path="/consignment" element={guard(<Consignment />)} />
        <Route path="/insights" element={guard(<Insights />)} />
        <Route path="/shows" element={<Shows />} />
        <Route path="/news" element={<News />} />
        <Route path="/stolen" element={<Stolen />} />
        <Route path="/pricing" element={guard(<Pricing />)} />
        <Route path="/settings" element={guard(<Settings />)} />
        <Route path="/t/:id" element={<TagPage />} />
        <Route path="/check" element={<CheckPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
    </HashRouter>
  );
}
