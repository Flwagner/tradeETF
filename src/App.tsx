import { NavLink, Route, Routes } from 'react-router-dom';
import { Activity, Database } from 'lucide-react';
import { EtfDetailPage } from './pages/EtfDetailPage';
import { HomePage } from './pages/HomePage';

export function App() {
  const isLocalRuntime = isLocalHostname();

  return (
    <div className={isLocalRuntime ? 'app-shell is-local-runtime' : 'app-shell'}>
      {isLocalRuntime ? <div className="dev-banner">DEV · Localhost</div> : null}
      <header className="topbar">
        <NavLink to="/" className="brand">
          <Activity size={20} />
          <span>tradeETF · Momentum ETF</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>
            <Database size={16} />
            Tableau de bord
          </NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/etfs/:id" element={<EtfDetailPage />} />
      </Routes>
    </div>
  );
}

function isLocalHostname() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}
