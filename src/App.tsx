import { useEffect, useCallback } from 'react';
import { SecurityGate } from './components/auth/SecurityGate';
import { MainLayout } from './components/layout/MainLayout';
import { InventoryList } from './components/inventory/InventoryList';
import { StockEntry } from './components/inventory/StockEntry';
import { ReportsList } from './components/reports/ReportsList';
import { useSession } from './hooks/useSession';
import { useIdleTimer } from './hooks/useIdleTimer';
import { useInventoryStore } from './store/useInventoryStore';
import { setSyncKey, clearSyncKey } from './lib/sync';
import { deriveKey } from './lib/crypto';
import { setEncryptionKey, clearEncryptionKey } from './lib/encryptedStorage';

function App() {
  const { isAuthenticated, unlock, logout } = useSession();
  const activeTab = useInventoryStore((s) => s.activeTab);
  const setOnline = useInventoryStore((s) => s.setOnline);
  const syncFromRemote = useInventoryStore((s) => s.syncFromRemote);
  const flushPending = useInventoryStore((s) => s.flushPending);
  const startRealtime = useInventoryStore((s) => s.startRealtime);

  // Handle unlock: derive key, set in all modules, sync from remote
  const handleUnlock = useCallback(async (pin: string, salt: string) => {
    const key = await deriveKey(pin, salt);
    setEncryptionKey(key);
    setSyncKey(key);
    await unlock(pin, salt);

    // Initial sync from Supabase after unlock
    setTimeout(() => {
      syncFromRemote();
    }, 100);
  }, [unlock, syncFromRemote]);

  // Handle logout: clear all keys
  const handleLogout = useCallback(() => {
    clearSyncKey();
    clearEncryptionKey();
    logout();
  }, [logout]);

  // Idle timer → auto-logout after 30 min inactivity
  useIdleTimer(handleLogout, isAuthenticated);

  // Online/offline tracking + flush pending on reconnect
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      flushPending();
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline, flushPending]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = startRealtime();
    return () => unsubscribe();
  }, [isAuthenticated, startRealtime]);

  return (
    <SecurityGate
      onUnlock={handleUnlock}
      onLogout={handleLogout}
      isAuthenticated={isAuthenticated}
    >
      <MainLayout onLogout={handleLogout}>
        {activeTab === 'inventory' && <InventoryList />}
        {activeTab === 'entry' && <StockEntry />}
        {activeTab === 'reports' && <ReportsList />}
      </MainLayout>
    </SecurityGate>
  );
}

export default App;
