import React from 'react';
import { Coffee, PackagePlus, FileBarChart2, LogOut } from 'lucide-react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { SyncIndicator } from '../ui/SyncIndicator';

interface MainLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, onLogout }) => {
  const activeTab = useInventoryStore((s) => s.activeTab);
  const setActiveTab = useInventoryStore((s) => s.setActiveTab);
  const toastMessage = useInventoryStore((s) => s.toastMessage);

  const tabs = [
    { key: 'inventory' as const, label: 'STOCK', icon: Coffee },
    { key: 'entry' as const, label: 'ENTRADAS', icon: PackagePlus },
    { key: 'reports' as const, label: 'REPORTES', icon: FileBarChart2 },
  ];

  return (
    <div className="antialiased text-coffee-dark bg-cream min-h-screen relative">

      {/* Top Bar */}
      <header className="fixed top-0 left-0 w-full bg-white/95 backdrop-blur-md border-b border-wood-light z-40 shadow-[0_2px_12px_rgba(200,169,139,0.08)]">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="bg-coffee-brown text-cream p-1.5 rounded-xl">
              <Coffee size={18} />
            </div>
            <h1 className="text-base font-serif font-bold text-coffee-dark leading-none">
              Café Stock
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <SyncIndicator />
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-text-muted hover:text-accent-red hover:bg-accent-red-light transition-all active:scale-90"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-toast-in">
          <div className="bg-coffee-dark text-white px-5 py-3 rounded-2xl shadow-lg text-sm font-medium">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Main Content (padded for top bar + bottom nav) */}
      <main className="w-full pt-16">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-wood-light pb-safe z-50 shadow-[0_-4px_20px_rgba(200,169,139,0.1)]">
        <div className="max-w-md mx-auto flex justify-around items-center px-4 py-3 relative">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-col items-center gap-1 w-20 transition-colors min-h-[48px] justify-center ${
                activeTab === key ? 'text-coffee-brown' : 'text-wood-medium'
              }`}
              aria-label={label}
            >
              <Icon size={24} className={activeTab === key ? 'stroke-[2.5px]' : ''} />
              <span className="text-[0.7rem] font-bold tracking-[0.3px]">{label}</span>
              <div
                className={`w-1 h-1 rounded-full mt-0.5 ${
                  activeTab === key ? 'bg-coffee-brown' : 'bg-transparent'
                }`}
              />
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default MainLayout;
