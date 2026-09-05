import { NavLink } from 'react-router-dom';
import { AppRoutes } from './app/router';
import { SyncStatus } from './features/sync/SyncStatus';

const NAV_ITEMS = [
  { to: '/', label: '学习' },
  { to: '/history', label: '日期' },
  { to: '/forgotten', label: '遗忘' },
  { to: '/stats', label: '统计' },
  { to: '/settings', label: '设置' },
];

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">WordMaster</span>
        <SyncStatus />
      </header>
      <main className="app-main" id="main-content">
        <AppRoutes />
      </main>
      <nav className="bottom-nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `bottom-nav__item${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
