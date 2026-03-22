import React, { useState, useEffect, useCallback } from 'react';
import { Coffee, Lock, ShieldAlert, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { hashPin, generateSalt } from '../../lib/crypto';

type GateState = 'loading' | 'setup' | 'locked' | 'unlocked' | 'locked_out';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface SecurityGateProps {
  children: React.ReactNode;
  onUnlock: (pin: string, salt: string) => Promise<void>;
  onLogout: () => void;
  isAuthenticated: boolean;
}

export const SecurityGate: React.FC<SecurityGateProps> = ({
  children,
  onUnlock,
  isAuthenticated,
}) => {
  const [gateState, setGateState] = useState<GateState>('loading');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [showPin, setShowPin] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if PIN is already configured in Supabase
  useEffect(() => {
    if (isAuthenticated) {
      setGateState('unlocked');
      return;
    }

    const checkConfig = async () => {
      try {
        const { data } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'pin_hash')
          .single();

        setGateState(data ? 'locked' : 'setup');
      } catch {
        // No config found → first time setup
        setGateState('setup');
      }
    };

    checkConfig();
  }, [isAuthenticated]);

  // Lockout countdown timer
  useEffect(() => {
    if (gateState !== 'locked_out' || !lockoutEnd) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, lockoutEnd - Date.now());
      setLockoutRemaining(Math.ceil(remaining / 1000));

      if (remaining <= 0) {
        setGateState('locked');
        setAttempts(0);
        setLockoutEnd(null);
        setError('');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gateState, lockoutEnd]);

  // Update gate state when auth changes
  useEffect(() => {
    if (isAuthenticated) {
      setGateState('unlocked');
    } else if (gateState === 'unlocked') {
      setGateState('locked');
      setPin('');
    }
  }, [isAuthenticated, gateState]);

  /** First-time PIN setup: create salt + hash, store in Supabase */
  const handleSetup = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos.');
      return;
    }
    if (pin !== confirmPin) {
      setError('Los PINs no coinciden. Verifica e intenta de nuevo.');
      return;
    }

    setIsProcessing(true);
    try {
      const salt = generateSalt();
      const pinHash = await hashPin(pin);

      // Store salt and hash in Supabase
      const { error: saltError } = await supabase
        .from('app_config')
        .upsert({ key: 'salt', value: salt }, { onConflict: 'key' });

      if (saltError) throw saltError;

      const { error: hashError } = await supabase
        .from('app_config')
        .upsert({ key: 'pin_hash', value: pinHash }, { onConflict: 'key' });

      if (hashError) throw hashError;

      // Derive key and unlock
      await onUnlock(pin, salt);
      setPin('');
      setConfirmPin('');
    } catch (err) {
      if (err instanceof Error) {
        setError(`Error al configurar: ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [pin, confirmPin, onUnlock]);

  /** Verify PIN against stored hash */
  const handleUnlock = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!pin) return;

    setIsProcessing(true);
    try {
      // Fetch stored salt and hash
      const { data: saltData } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'salt')
        .single();

      const { data: hashData } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'pin_hash')
        .single();

      if (!saltData || !hashData) {
        setError('Configuración no encontrada. Contacta al administrador.');
        return;
      }

      const enteredHash = await hashPin(pin);

      if (enteredHash !== hashData.value) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');

        if (newAttempts >= MAX_ATTEMPTS) {
          const end = Date.now() + LOCKOUT_DURATION_MS;
          setLockoutEnd(end);
          setLockoutRemaining(Math.ceil(LOCKOUT_DURATION_MS / 1000));
          setGateState('locked_out');
          setError('');
        } else {
          setError(`PIN incorrecto. ${MAX_ATTEMPTS - newAttempts} intentos restantes.`);
        }
        return;
      }

      // PIN correct — derive key and unlock
      await onUnlock(pin, saltData.value);
      setPin('');
      setAttempts(0);
    } catch (err) {
      if (err instanceof Error) {
        setError(`Error de conexión: ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [pin, attempts, onUnlock]);

  // ─── RENDER ───

  if (gateState === 'loading') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-wood-medium border-t-coffee-brown rounded-full animate-spin" />
          <p className="text-text-muted font-medium">Verificando configuración...</p>
        </div>
      </div>
    );
  }

  if (gateState === 'unlocked') {
    return <>{children}</>;
  }

  if (gateState === 'locked_out') {
    const minutes = Math.floor(lockoutRemaining / 60);
    const seconds = lockoutRemaining % 60;

    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(200,169,139,0.2)] border border-accent-red-border flex flex-col items-center">
          <div className="w-16 h-16 bg-accent-red-light text-accent-red rounded-2xl flex items-center justify-center mb-6">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-2xl font-serif font-bold text-coffee-dark mb-2 text-center">
            Acceso Bloqueado
          </h1>
          <p className="text-text-muted mb-6 text-center text-sm font-medium">
            Demasiados intentos fallidos. Espera antes de volver a intentar.
          </p>
          <div className="bg-accent-red-bg border border-accent-red-border rounded-2xl px-6 py-4 text-center">
            <p className="text-3xl font-bold text-accent-red tabular-nums">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </p>
            <p className="text-xs text-text-muted mt-1 font-medium">Tiempo restante</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── SETUP or LOCKED ───
  const isSetup = gateState === 'setup';

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(200,169,139,0.2)] border border-wood-light flex flex-col items-center">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm ${
          isSetup ? 'bg-wood-light text-coffee-dark' : 'bg-wood-medium text-coffee-dark'
        }`}>
          {isSetup ? <ShieldCheck size={32} /> : <Coffee size={32} />}
        </div>

        <h1 className="text-2xl font-serif font-bold text-coffee-dark mb-2 text-center">
          {isSetup ? 'Configurar PIN' : 'Acceso Restringido'}
        </h1>
        <p className="text-text-muted mb-8 text-center text-sm font-medium">
          {isSetup
            ? 'Crea un PIN de seguridad para proteger tu inventario.'
            : 'Ingresa el PIN de seguridad para acceder al inventario.'}
        </p>

        <form onSubmit={isSetup ? handleSetup : handleUnlock} className="w-full space-y-4">
          {/* PIN input */}
          <div className="relative">
            <input
              id="pin-input"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={8}
              placeholder={isSetup ? 'Nuevo PIN (mín. 4 dígitos)' : '••••'}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              className="w-full pl-14 pr-14 py-4 rounded-2xl bg-cream border border-wood-medium text-coffee-dark text-center text-2xl tracking-[0.3em] font-bold focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
              autoFocus
            />
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted" size={24} />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-text-muted hover:text-coffee-brown transition-colors p-1"
              aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
            >
              {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {/* Confirm PIN (setup only) */}
          {isSetup && (
            <div className="relative">
              <input
                id="confirm-pin-input"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={8}
                placeholder="Confirmar PIN"
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value.replace(/\D/g, ''));
                  setError('');
                }}
                className="w-full pl-14 pr-4 py-4 rounded-2xl bg-cream border border-wood-medium text-coffee-dark text-center text-2xl tracking-[0.3em] font-bold focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
              />
              <ShieldCheck className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted" size={24} />
            </div>
          )}

          {error && (
            <p className="text-accent-red font-medium text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isProcessing}
            className="w-full py-4 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all shadow-[0_4px_12px_rgba(92,61,46,0.2)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : null}
            {isSetup ? 'Crear PIN y Entrar' : 'Entrar al Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SecurityGate;
