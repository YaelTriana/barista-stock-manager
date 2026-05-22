import React, { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Trash2, User, Eye, EyeOff, ShieldCheck, Lock } from 'lucide-react';
import { loadUsers, addUser, removeUser, changeUserPin } from '../../lib/userAuth';
import { ROLE_LABELS, ROLE_COLORS, type AppUser, type UserRole } from '../../schemas/user';
import { useCurrentUser } from '../../contexts/UserContext';

interface UserManagementProps {
  isOpen: boolean;
  onClose: () => void;
}

type PanelView = 'list' | 'add_user' | 'change_pin';

export const UserManagement: React.FC<UserManagementProps> = ({ isOpen, onClose }) => {
  const { masterKey, userId: currentUserId } = useCurrentUser();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [view, setView] = useState<PanelView>('list');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add user form
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('registrar');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Change PIN
  const [changePinUserId, setChangePinUserId] = useState<string | null>(null);
  const [cpNewPin, setCpNewPin] = useState('');
  const [cpConfirmPin, setCpConfirmPin] = useState('');
  const [showCpPin, setShowCpPin] = useState(false);

  const loadUserList = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await loadUsers();
      setUsers(list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadUserList();
      setView('list');
      setError('');
      setSuccess('');
    }
  }, [isOpen, loadUserList]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newUsername.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return; }
    if (newPin.length < 4) { setError('El PIN debe tener al menos 4 dígitos.'); return; }
    if (newPin !== confirmPin) { setError('Los PINs no coinciden.'); return; }
    if (!masterKey) { setError('Error: sesión sin llave de cifrado.'); return; }

    setIsLoading(true);
    try {
      await addUser(newUsername.trim(), newRole, newPin, masterKey);
      await loadUserList();
      setView('list');
      setNewUsername(''); setNewRole('registrar'); setNewPin(''); setConfirmPin('');
      showSuccess(`Usuario "${newUsername.trim()}" creado con éxito.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear usuario.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveUser = async (user: AppUser) => {
    if (!window.confirm(`¿Eliminar al usuario "${user.username}"? Esta acción no se puede deshacer.`)) return;
    setError('');
    setIsLoading(true);
    try {
      await removeUser(user.id);
      await loadUserList();
      showSuccess(`Usuario "${user.username}" eliminado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar usuario.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (cpNewPin.length < 4) { setError('El nuevo PIN debe tener al menos 4 dígitos.'); return; }
    if (cpNewPin !== cpConfirmPin) { setError('Los PINs no coinciden.'); return; }
    if (!masterKey || !changePinUserId) { setError('Error: datos faltantes.'); return; }

    setIsLoading(true);
    try {
      await changeUserPin(changePinUserId, cpNewPin, masterKey);
      await loadUserList();
      setView('list');
      setCpNewPin(''); setCpConfirmPin(''); setChangePinUserId(null);
      showSuccess('PIN actualizado con éxito.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 bg-coffee-dark/40 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-cream w-full max-w-md rounded-t-[32px] sm:rounded-3xl shadow-2xl relative z-10 p-6 pt-8 max-h-[90vh] overflow-y-auto">
        <div className="w-12 h-1.5 bg-wood-medium/50 rounded-full mx-auto mb-5 sm:hidden absolute top-3 left-1/2 -translate-x-1/2" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            {view !== 'list' && (
              <button onClick={() => { setView('list'); setError(''); }} className="p-1.5 text-text-muted hover:text-coffee-brown transition-colors">
                <X size={18} />
              </button>
            )}
            <h2 className="text-xl font-serif font-bold text-coffee-dark">
              {view === 'list' ? 'Gestión de Usuarios' : view === 'add_user' ? 'Nuevo Usuario' : 'Cambiar PIN'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-text-muted hover:text-accent-red hover:bg-accent-red-light rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Feedback */}
        {success && (
          <div className="flex items-center gap-2 bg-accent-green-light border border-accent-green/30 rounded-2xl px-4 py-3 mb-4">
            <ShieldCheck size={16} className="text-accent-green shrink-0" />
            <p className="text-sm font-medium text-accent-green">{success}</p>
          </div>
        )}
        {error && <p className="text-accent-red text-sm font-medium text-center mb-4">{error}</p>}

        {/* ─── LIST VIEW ─── */}
        {view === 'list' && (
          <>
            <div className="flex flex-col gap-3 mb-6">
              {isLoading && <p className="text-center text-text-muted text-sm py-4">Cargando...</p>}
              {!isLoading && users.map(user => {
                const colors = ROLE_COLORS[user.role];
                const isSelf = user.id === currentUserId;
                return (
                  <div key={user.id} className="bg-white rounded-2xl border border-wood-light p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-coffee-brown/10 rounded-xl flex items-center justify-center shrink-0">
                      <User size={20} className="text-coffee-brown" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-coffee-dark leading-tight">{user.username}</p>
                        {isSelf && <span className="text-[0.65rem] bg-wood-light text-text-muted px-2 py-0.5 rounded-full font-bold">Tú</span>}
                      </div>
                      <span className={`inline-block text-[0.65rem] font-bold px-2 py-0.5 rounded-full mt-1 ${colors.bg} ${colors.text}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setChangePinUserId(user.id); setCpNewPin(''); setCpConfirmPin(''); setError(''); setView('change_pin'); }}
                        className="p-2 rounded-xl text-text-muted hover:text-coffee-brown hover:bg-wood-light transition-all"
                        title="Cambiar PIN"
                      >
                        <Lock size={16} />
                      </button>
                      {!isSelf && user.role !== 'admin' && (
                        <button
                          onClick={() => handleRemoveUser(user)}
                          className="p-2 rounded-xl text-text-muted hover:text-accent-red hover:bg-accent-red-light transition-all"
                          title="Eliminar usuario"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => { setView('add_user'); setError(''); setNewUsername(''); setNewRole('registrar'); setNewPin(''); setConfirmPin(''); }}
              className="w-full py-3.5 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(92,61,46,0.2)] min-h-[48px]"
            >
              <UserPlus size={20} />
              Agregar Usuario
            </button>
          </>
        )}

        {/* ─── ADD USER FORM ─── */}
        {view === 'add_user' && (
          <form onSubmit={handleAddUser} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-text-muted mb-1.5 ml-1 uppercase tracking-wide">Nombre de usuario</label>
              <div className="relative">
                <input
                  type="text" required value={newUsername}
                  onChange={e => { setNewUsername(e.target.value); setError(''); }}
                  placeholder="Ej. María"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-wood-medium text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all"
                  autoFocus
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-muted mb-1.5 ml-1 uppercase tracking-wide">Rol</label>
              <div className="grid grid-cols-3 gap-2">
                {(['admin', 'registrar', 'viewer'] as UserRole[]).map(r => (
                  <button
                    key={r} type="button"
                    onClick={() => setNewRole(r)}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                      newRole === r
                        ? 'bg-coffee-brown text-white border-coffee-brown shadow-md'
                        : 'bg-white text-text-muted border-wood-medium hover:border-coffee-brown hover:text-coffee-brown'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-2 ml-1">
                {newRole === 'admin' && 'Acceso total: puede agregar/eliminar productos y gestionar usuarios.'}
                {newRole === 'registrar' && 'Puede registrar entradas y salidas de inventario.'}
                {newRole === 'viewer' && 'Solo puede consultar inventario y reportes.'}
              </p>
            </div>

            <PinFormField label="PIN de acceso" value={newPin} onChange={v => { setNewPin(v); setError(''); }} show={showPin} onToggle={() => setShowPin(!showPin)} />
            <PinFormField label="Confirmar PIN" value={confirmPin} onChange={v => { setConfirmPin(v); setError(''); }} show={showPin} onToggle={() => setShowPin(!showPin)} />

            {error && <p className="text-accent-red text-sm font-medium text-center">{error}</p>}

            <button
              type="submit" disabled={isLoading}
              className="w-full py-4 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(92,61,46,0.2)] disabled:opacity-60 min-h-[48px]"
            >
              {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Crear Usuario
            </button>
          </form>
        )}

        {/* ─── CHANGE PIN FORM ─── */}
        {view === 'change_pin' && (
          <form onSubmit={handleChangePin} className="space-y-4">
            <p className="text-sm text-text-muted text-center mb-2">
              Ingresa el nuevo PIN para <span className="font-bold text-coffee-dark">{users.find(u => u.id === changePinUserId)?.username}</span>.
            </p>
            <PinFormField label="Nuevo PIN" value={cpNewPin} onChange={v => { setCpNewPin(v); setError(''); }} show={showCpPin} onToggle={() => setShowCpPin(!showCpPin)} autoFocus />
            <PinFormField label="Confirmar nuevo PIN" value={cpConfirmPin} onChange={v => { setCpConfirmPin(v); setError(''); }} show={showCpPin} onToggle={() => setShowCpPin(!showCpPin)} />

            {error && <p className="text-accent-red text-sm font-medium text-center">{error}</p>}

            <button
              type="submit" disabled={isLoading}
              className="w-full py-4 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(92,61,46,0.2)] disabled:opacity-60 min-h-[48px]"
            >
              {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Guardar Nuevo PIN
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const PinFormField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoFocus?: boolean;
}> = ({ label, value, onChange, show, onToggle, autoFocus }) => (
  <div>
    <label className="block text-xs font-bold text-text-muted mb-1.5 ml-1 uppercase tracking-wide">{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        inputMode="numeric"
        maxLength={8}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        autoFocus={autoFocus}
        placeholder="••••"
        className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-white border border-wood-medium text-coffee-dark text-center text-xl tracking-[0.3em] font-bold focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
      />
      <button type="button" onClick={onToggle} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-coffee-brown transition-colors">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>
);

export default UserManagement;
