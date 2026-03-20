import React, { useState } from 'react';
import { Coffee, Lock } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1900') {
      onLogin();
    } else {
      setError('PIN incorrecto. Intenta de nuevo.');
      setPin('');
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white p-8 rounded-[32px] shadow-[0_8px_30px_rgba(200,169,139,0.2)] border border-wood-light flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 bg-wood-medium text-coffee-dark rounded-2xl flex items-center justify-center mb-6 shadow-sm">
          <Coffee size={32} />
        </div>
        
        <h1 className="text-2xl font-serif font-bold text-coffee-dark mb-2 text-center">
          Acceso Restringido
        </h1>
        <p className="text-text-muted mb-8 text-center text-sm font-medium">
          Ingresa el PIN de seguridad para acceder al inventario del café.
        </p>

        <form onSubmit={handleLogin} className="w-full">
          <div className="relative mb-6">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError('');
              }}
              className="w-full pl-14 pr-4 py-4 rounded-2xl bg-cream border border-wood-medium text-coffee-dark text-center text-3xl tracking-[0.3em] font-bold focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all placeholder:tracking-normal placeholder:font-normal"
            />
            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted" size={24} />
          </div>
          
          {error && <p className="text-accent-red font-medium text-sm mb-4 text-center">{error}</p>}
          
          <button
            type="submit"
            className="w-full py-4 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all shadow-[0_4px_12px_rgba(92,61,46,0.2)] active:scale-[0.98]"
          >
            Entrar al Sistema
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
