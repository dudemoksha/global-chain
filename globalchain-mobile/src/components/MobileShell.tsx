import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Home, 
  Users, 
  ArrowLeftRight,
  User as UserIcon, 
  Bell, 
  ChevronLeft,
  Bot,
  Package,
  UserCheck,
  Cpu,
  MoreHorizontal
} from 'lucide-react';
import { useState } from 'react';

interface MobileShellProps {
  children: React.ReactNode;
}

export const MobileShell: React.FC<MobileShellProps> = ({ children }) => {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

  const isRootPage = ['/dashboard', '/suppliers', '/requests', '/inventory', '/profile', '/analytics'].includes(location.pathname);

  // User nav — same 7 items as website: Dashboard, My SKUs, Suppliers, Customers, Requests, Simulation, Assistant
  // Bottom bar shows 5 primary tabs + "More" for the remaining
  const primaryUserTabs = [
    { path: '/dashboard', label: 'Home', icon: Home },
    { path: '/inventory', label: 'My SKUs', icon: Package },
    { path: '/suppliers', label: 'Suppliers', icon: Users },
    { path: '/requests', label: 'Requests', icon: ArrowLeftRight },
    { path: '/profile', label: 'Profile', icon: UserIcon },
  ];

  const moreUserTabs = [
    { path: '/customers', label: 'Customers', icon: UserCheck },
    { path: '/simulation', label: 'Simulation', icon: Cpu },
    { path: '/assistant', label: 'Assistant', icon: Bot },
  ];

  const adminTabs = [
    { path: '/dashboard', label: 'Home', icon: Home },
    { path: '/profile', label: 'Profile', icon: UserIcon },
  ];

  const tabs = isAdmin ? adminTabs : primaryUserTabs;

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) return 'Dashboard';
    if (path.startsWith('/suppliers')) return 'Suppliers';
    if (path.startsWith('/warehouses')) return 'Warehouses';
    if (path.startsWith('/inventory')) return 'My SKUs';
    if (path.startsWith('/factories')) return 'Factories';
    if (path.startsWith('/requests')) return 'Trade Requests';
    if (path.startsWith('/customers')) return 'Customers';
    if (path.startsWith('/assistant')) return 'AI Assistant';
    if (path.startsWith('/analytics')) return 'Analytics';
    if (path.startsWith('/simulation')) return 'Simulation';
    if (path.startsWith('/alerts')) return 'Alerts';
    if (path.startsWith('/signals')) return 'Signals';
    return 'Global-Chain';
  };

  const isMoreActive = moreUserTabs.some(t => location.pathname.startsWith(t.path));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-50 bg-background border-b border-border h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {!isRootPage && !isMoreActive && (
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 -ml-2 rounded-md hover:bg-surface text-foreground"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {isMoreActive && (
            <button 
              onClick={() => navigate('/dashboard')} 
              className="p-2 -ml-2 rounded-md hover:bg-surface text-foreground"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <span className="font-display font-medium text-lg tracking-tight">
            {getPageTitle()}
          </span>
          {isAdmin && (
            <span className="mono-label !text-primary text-[10px] ml-1.5 border border-primary/20 px-1 rounded-sm">
              Admin
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Alerts Bell (For non-admins) */}
          {!isAdmin && (
            <button 
              onClick={() => navigate('/alerts')}
              className="p-2 rounded-md hover:bg-surface text-muted-foreground hover:text-foreground relative"
            >
              <Bell size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="flex-1 pb-20 overflow-x-hidden">
        {children}
      </main>

      {/* Sticky Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border h-16 flex items-center justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => { navigate(tab.path); setShowMore(false); }}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors ${
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={20} className={isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'} />
              <span className="text-[10px] font-medium mt-1 tracking-tight">
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* More tab for non-admins — covers Customers, Simulation, Assistant */}
        {!isAdmin && (
          <button
            onClick={() => setShowMore(v => !v)}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-colors ${
              isMoreActive || showMore
                ? 'text-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MoreHorizontal size={20} className={(isMoreActive || showMore) ? 'stroke-[2.5px]' : 'stroke-[2px]'} />
            <span className="text-[10px] font-medium mt-1 tracking-tight">More</span>
          </button>
        )}
      </nav>

      {/* More Drawer */}
      {showMore && !isAdmin && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-foreground/20"
            onClick={() => setShowMore(false)}
          />
          <div className="fixed bottom-16 left-0 right-0 z-50 bg-background border-t border-border shadow-2xl rounded-t-2xl">
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>
            <div className="px-4 py-3">
              <div className="mono-label mb-3">More pages</div>
              <div className="grid grid-cols-3 gap-2 pb-3">
                {moreUserTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = location.pathname.startsWith(tab.path);
                  return (
                    <button
                      key={tab.path}
                      onClick={() => { navigate(tab.path); setShowMore(false); }}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                        isActive
                          ? 'border-primary/30 bg-primary/5 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-surface'
                      }`}
                    >
                      <Icon size={22} className={isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'} />
                      <span className="text-[11px] font-medium tracking-tight">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
