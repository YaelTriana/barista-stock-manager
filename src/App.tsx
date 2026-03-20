import { useState, useEffect } from 'react';
import { InventoryList } from './components/InventoryList';
import { StockEntry } from './components/StockEntry';
import { Reports } from './components/Reports';
import { Login } from './components/Login';
import { Coffee, PackagePlus, FileBarChart2 } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'entry' | 'reports'>('inventory');

  useEffect(() => {
    const authStatus = localStorage.getItem('cafe-auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    localStorage.setItem('cafe-auth', 'true');
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="antialiased text-coffee-dark bg-cream min-h-screen relative">
      
      {/* Contenido Dinámico */}
      <main className="w-full">
        {activeTab === 'inventory' && <InventoryList />}
        {activeTab === 'entry' && <StockEntry />}
        {activeTab === 'reports' && <Reports />}
      </main>

      {/* Navegación Inferior (Mobile Bottom Bar) */}
      <nav className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-wood-light pb-safe z-50 shadow-[0_-4px_20px_rgba(200,169,139,0.1)]">
        <div className="max-w-md mx-auto flex justify-around items-center px-4 py-3 relative">
          
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex flex-col items-center gap-1 w-20 transition-colors ${activeTab === 'inventory' ? 'text-coffee-brown' : 'text-wood-medium'}`}
          >
            <Coffee size={24} className={`${activeTab === 'inventory' ? 'stroke-[2.5px]' : ''}`} />
            <span className="text-[0.7rem] font-bold tracking-[0.3px]">STOCK</span>
            <div className={`w-1 h-1 rounded-full mt-0.5 ${activeTab === 'inventory' ? 'bg-coffee-brown' : 'bg-transparent'}`} />
          </button>

          <button 
            onClick={() => setActiveTab('entry')}
            className={`flex flex-col items-center gap-1 w-20 transition-colors ${activeTab === 'entry' ? 'text-coffee-brown' : 'text-wood-medium'}`}
          >
            <PackagePlus size={24} className={`${activeTab === 'entry' ? 'stroke-[2.5px]' : ''}`} />
            <span className="text-[0.7rem] font-bold tracking-[0.3px]">ENTRADAS</span>
            <div className={`w-1 h-1 rounded-full mt-0.5 ${activeTab === 'entry' ? 'bg-coffee-brown' : 'bg-transparent'}`} />
          </button>

          <button 
            onClick={() => setActiveTab('reports')}
            className={`flex flex-col items-center gap-1 w-20 transition-colors ${activeTab === 'reports' ? 'text-coffee-brown' : 'text-wood-medium'}`}
          >
            <FileBarChart2 size={24} className={`${activeTab === 'reports' ? 'stroke-[2.5px]' : ''}`} />
            <span className="text-[0.7rem] font-bold tracking-[0.3px]">REPORTES</span>
            <div className={`w-1 h-1 rounded-full mt-0.5 ${activeTab === 'reports' ? 'bg-coffee-brown' : 'bg-transparent'}`} />
          </button>

        </div>
      </nav>

    </div>
  );
}

export default App;
