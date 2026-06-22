import { NavLink, Route, Routes } from 'react-router-dom';
import { Activity, Database } from 'lucide-react';
import { EtfDetailPage } from './pages/EtfDetailPage';
import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <div className="app-shell">
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
