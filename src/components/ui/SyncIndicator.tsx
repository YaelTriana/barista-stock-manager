import React from 'react';
import { Wifi, WifiOff, CloudOff, RefreshCw } from 'lucide-react';
import { useInventoryStore } from '../../store/useInventoryStore';

export const SyncIndicator: React.FC = () => {
  const syncStatus = useInventoryStore((s) => s.syncStatus);
  const isOnline = useInventoryStore((s) => s.isOnline);

  const getConfig = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff size={16} />,
        label: 'Sin conexión',
        className: 'bg-accent-gray-light text-accent-gray',
        pulse: false,
      };
    }

    switch (syncStatus) {
      case 'synced':
        return {
          icon: <Wifi size={16} />,
          label: 'Sincronizado',
          className: 'bg-accent-green-light text-accent-green',
          pulse: false,
        };
      case 'syncing':
        return {
          icon: <RefreshCw size={16} className="animate-spin" />,
          label: 'Sincronizando...',
          className: 'bg-accent-amber-light text-accent-amber',
          pulse: false,
        };
      case 'pending':
        return {
          icon: <CloudOff size={16} />,
          label: 'Cambios pendientes',
          className: 'bg-accent-amber-light text-accent-amber',
          pulse: true,
        };
      case 'error':
        return {
          icon: <WifiOff size={16} />,
          label: 'Error de sync',
          className: 'bg-accent-red-light text-accent-red',
          pulse: true,
        };
      default:
        return {
          icon: <Wifi size={16} />,
          label: 'Conectado',
          className: 'bg-accent-green-light text-accent-green',
          pulse: false,
        };
    }
  };

  const config = getConfig();

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
        config.className
      } ${config.pulse ? 'animate-sync-pulse' : ''}`}
      role="status"
      aria-label={config.label}
    >
      {config.icon}
      <span className="hidden sm:inline">{config.label}</span>
    </div>
  );
};

export default SyncIndicator;
