import React, { useState, useEffect, useCallback } from 'react';
import {
  Coffee, Lock, ShieldAlert, Eye, EyeOff, User, Users, ArrowLeft, ShieldCheck,
} from 'lucide-react';
import {
  detectSetupState,
  loadUsers,
  setupFirstAdmin,
  migrateToMultiUser,
  loginUser,
} from '../../lib/userAuth';
import { ROLE_LABELS, type AppUser } from '../../schemas/user';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

interface SecurityGateProps {
  children: React.ReactNode;
  onUnlock: (masterKey: CryptoKey, user: AppUser) => Promise<void>;
  isAuthenticated: boolean;
}

type Screen =
  | 'loading'
  | 'fresh_setup'
  | 'migration'
  | 'user_select'
  | 'pin_entry'
  | 'locked_out'
  | 'unlocked';

export const SecurityGate: React.FC<SecurityGateProps> = ({
  children,
  onUnlock,
  isAuthenticated,
}) => {
  const [screen, setScreen] = useState<Screen>('loading');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  // Form fields
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // State
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // On mount: detect app state
  useEffect(() => {
    if (isAuthenticated) {
      setScreen('unlocked');
      return;
    }

    const init = async () => {
      const state = await detectSetupState();

      if (state === 'ready') {
        const userList = await loadUsers();
        setUsers(userList);
        setScreen('user_select');
      } else if (state === 'migration') {
        setScreen('migration');
      } else {
        setScreen('fresh_setup');
      }
    };

    init();
  }, [isAuthenticated]);

  // When auth changes externally (logout)
  useEffect(() => {
    if (!isAuthenticated && screen === 'unlocked') {
      setScreen('user_select');
      setPin('');
      setSelectedUser(null);
    }
    if (isAuthenticated) {
      setScreen('unlocked');
    }
  }, [isAuthenticated, screen]);

  // Lockout countdown
  useEffect(() => {
    if (screen !== 'locked_out' || !lockoutEnd) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, lockoutEnd - Date.now());
      setLockoutRemaining(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        setScreen('pin_entry');
        setAttempts(0);
        setLockoutEnd(null);
        setError('');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [screen, lockoutEnd]);

  // ─── HANDLERS ───

  const handleFreshSetup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (username.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return; }
    if (pin.length < 4) { setError('El PIN debe tener al menos 4 dígitos.'); return; }
    if (pin !== confirmPin) { setError('Los PINs no coinciden.'); return; }

    setIsProcessing(true);
    try {
      const { user, masterKey } = await setupFirstAdmin(username.trim(), pin);
      setUsers([user]);
      await onUnlock(masterKey, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al configurar el sistema.');
    } finally {
      setIsProcessing(false);
    }
  }, [username, pin, confirmPin, onUnlock]);

  const handleMigration = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (username.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return; }
    if (!pin) { setError('Ingresa tu PIN actual.'); return; }

    setIsProcessing(true);
    try {
      const result = await migrateToMultiUser(username.trim(), pin);
      if (!result) {
        setError('PIN incorrecto. Verifica e intenta de nuevo.');
        setPin('');
        return;
      }
      setUsers([result.user]);
      await onUnlock(result.masterKey, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al migrar.');
    } finally {
      setIsProcessing(false);
    }
  }, [username, pin, onUnlock]);

  const handleSelectUser = useCallback((user: AppUser) => {
    setSelectedUser(user);
    setPin('');
    setError('');
    setAttempts(0);
    setScreen('pin_entry');
  }, []);

  const handlePinSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !pin) return;
    setError('');
    setIsProcessing(true);

    try {
      const result = await loginUser(selectedUser.username, pin);

      if (!result) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');

        if (newAttempts >= MAX_ATTEMPTS) {
          const end = Date.now() + LOCKOUT_DURATION_MS;
          setLockoutEnd(end);
          setLockoutRemaining(Math.ceil(LOCKOUT_DURATION_MS / 1000));
          setScreen('locked_out');
        } else {
          setError(`PIN incorrecto. ${MAX_ATTEMPTS - newAttempts} intentos restantes.`);
        }
        return;
      }

      setAttempts(0);
      await onUnlock(result.masterKey, result.user);
    } catch (err) {
      setError(err instanceof Error ? `Error: ${err.message}` : 'Error de conexión.');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedUser, pin, attempts, onUnlock]);

  // ─── RENDER ───

  if (screen === 'unlocked') return <>{children}</>;

  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-wood-medium border-t-coffee-brown rounded-full animate-spin" />
          <p className="text-text-muted font-medium">Iniciando sistema...</p>
        </div>
      </div>
    );
  }

  if (screen === 'locked_out') {
    const mins = Math.floor(lockoutRemaining / 60);
    const secs = lockoutRemaining % 60;
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(200,169,139,0.2)] border border-accent-red-border flex flex-col items-center">
          <div className="w-16 h-16 bg-accent-red-light text-accent-red rounded-2xl flex items-center justify-center mb-6">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-2xl font-serif font-bold text-coffee-dark mb-2 text-center">Acceso Bloqueado</h1>
          <p className="text-text-muted mb-6 text-center text-sm font-medium">
            Demasiados intentos fallidos para <span className="font-bold text-coffee-dark">{selectedUser?.username}</span>.
          </p>
          <div className="bg-accent-red-bg border border-accent-red-border rounded-2xl px-6 py-4 text-center mb-4">
            <p className="text-3xl font-bold text-accent-red tabular-nums">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </p>
            <p className="text-xs text-text-muted mt-1 font-medium">Tiempo restante</p>
          </div>
          <button
            onClick={() => { setScreen('user_select'); setSelectedUser(null); setAttempts(0); }}
            className="text-sm text-coffee-brown font-semibold hover:underline"
          >
            Volver a selección de usuario
          </button>
        </div>
      </div>
    );
  }

  // ─── FRESH SETUP ───
  if (screen === 'fresh_setup') {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(200,169,139,0.2)] border border-wood-light flex flex-col items-center">
          <div className="w-16 h-16 bg-wood-light text-coffee-dark rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl font-serif font-bold text-coffee-dark mb-1 text-center">Primer Inicio</h1>
          <p className="text-text-muted mb-6 text-center text-sm font-medium">
            Crea la cuenta de administrador para comenzar.
          </p>

          <form onSubmit={handleFreshSetup} className="w-full space-y-4">
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1.5 ml-1 uppercase tracking-wide">Nombre de usuario</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ej. Carlos"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-cream border border-wood-medium text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all"
                  autoFocus
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              </div>
            </div>

            <PinInput label="PIN de administrador" value={pin} onChange={v => { setPin(v); setError(''); }} show={showPin} onToggle={() => setShowPin(!showPin)} placeholder="Mín. 4 dígitos" />
            <PinInput label="Confirmar PIN" value={confirmPin} onChange={v => { setConfirmPin(v); setError(''); }} show={showPin} onToggle={() => setShowPin(!showPin)} placeholder="Repite el PIN" />

            {error && <p className="text-accent-red font-medium text-sm text-center">{error}</p>}

            <SubmitButton isProcessing={isProcessing} label="Crear Sistema" />
          </form>
        </div>
      </div>
    );
  }

  // ─── MIGRATION ───
  if (screen === 'migration') {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(200,169,139,0.2)] border border-wood-light flex flex-col items-center">
          <div className="w-16 h-16 bg-wood-medium/30 text-coffee-brown rounded-2xl flex items-center justify-center mb-4">
            <Users size={32} />
          </div>
          <h1 className="text-xl font-serif font-bold text-coffee-dark mb-1 text-center">Actualización del Sistema</h1>
          <p className="text-text-muted mb-6 text-center text-sm font-medium">
            Se detectó la versión anterior. Ingresa tu PIN para actualizar al sistema multi-usuario.
          </p>

          <form onSubmit={handleMigration} className="w-full space-y-4">
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1.5 ml-1 uppercase tracking-wide">Tu nombre de administrador</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Ej. Carlos"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError(''); }}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-cream border border-wood-medium text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all"
                  autoFocus
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              </div>
            </div>

            <PinInput label="PIN actual" value={pin} onChange={v => { setPin(v); setError(''); }} show={showPin} onToggle={() => setShowPin(!showPin)} placeholder="Tu PIN de acceso" />

            {error && <p className="text-accent-red font-medium text-sm text-center">{error}</p>}

            <SubmitButton isProcessing={isProcessing} label="Actualizar y Entrar" />
          </form>
        </div>
      </div>
    );
  }

  // ─── USER SELECT ───
  if (screen === 'user_select') {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="bg-coffee-brown text-cream p-2.5 rounded-2xl shadow-[0_4px_12px_rgba(92,61,46,0.2)]">
              <Coffee size={24} />
            </div>
            <h1 className="text-2xl font-serif font-bold text-coffee-dark">Café Stock</h1>
          </div>

          <div className="bg-white rounded-[28px] shadow-[0_8px_30px_rgba(200,169,139,0.15)] border border-wood-light p-6">
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4 text-center">Selecciona tu usuario</p>

            <div className="flex flex-col gap-3">
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-wood-light bg-cream hover:bg-wood-light hover:border-wood-medium transition-all active:scale-[0.98] text-left"
                >
                  <div className="w-10 h-10 bg-coffee-brown/10 rounded-xl flex items-center justify-center shrink-0">
                    <User size={20} className="text-coffee-brown" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-coffee-dark leading-tight truncate">{user.username}</p>
                    <p className="text-xs text-text-muted mt-0.5">{ROLE_LABELS[user.role]}</p>
                  </div>
                  <Lock size={16} className="text-wood-medium shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── PIN ENTRY ───
  if (screen === 'pin_entry' && selectedUser) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(200,169,139,0.2)] border border-wood-light flex flex-col items-center">
          <div className="w-16 h-16 bg-wood-light rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <User size={32} className="text-coffee-brown" />
          </div>

          <h2 className="text-xl font-serif font-bold text-coffee-dark mb-0.5 text-center">{selectedUser.username}</h2>
          <span className="text-xs font-bold text-text-muted bg-cream px-3 py-1 rounded-full mb-6">
            {ROLE_LABELS[selectedUser.role]}
          </span>

          <form onSubmit={handlePinSubmit} className="w-full space-y-4">
            <PinInput label="PIN de acceso" value={pin} onChange={v => { setPin(v); setError(''); }} show={showPin} onToggle={() => setShowPin(!showPin)} placeholder="••••" autoFocus />

            {error && <p className="text-accent-red font-medium text-sm text-center">{error}</p>}

            <SubmitButton isProcessing={isProcessing} label="Entrar al Sistema" />
          </form>

          <button
            onClick={() => { setScreen('user_select'); setSelectedUser(null); setPin(''); setError(''); setAttempts(0); }}
            className="mt-4 flex items-center gap-1.5 text-sm text-text-muted hover:text-coffee-brown transition-colors font-medium"
          >
            <ArrowLeft size={16} />
            Cambiar usuario
          </button>
        </div>
      </div>
    );
  }

  return null;
};

// ─── SHARED UI COMPONENTS ───

const PinInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}> = ({ label, value, onChange, show, onToggle, placeholder, autoFocus }) => (
  <div>
    <label className="block text-xs font-bold text-text-muted mb-1.5 ml-1 uppercase tracking-wide">{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        inputMode="numeric"
        maxLength={8}
        placeholder={placeholder || '••••'}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        autoFocus={autoFocus}
        className="w-full pl-11 pr-11 py-4 rounded-2xl bg-cream border border-wood-medium text-coffee-dark text-center text-2xl tracking-[0.3em] font-bold focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
      />
      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
      <button type="button" onClick={onToggle} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-coffee-brown transition-colors p-1">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>
);

const SubmitButton: React.FC<{ isProcessing: boolean; label: string }> = ({ isProcessing, label }) => (
  <button
    type="submit"
    disabled={isProcessing}
    className="w-full py-4 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all shadow-[0_4px_12px_rgba(92,61,46,0.2)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
  >
    {isProcessing && <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
    {label}
  </button>
);

export default SecurityGate;
