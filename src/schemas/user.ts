import { z } from 'zod';

/** User roles with specific permission levels */
export const UserRoleSchema = z.enum(['admin', 'registrar', 'viewer']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Role display labels in Spanish */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  registrar: 'Registrador',
  viewer: 'Lector',
};

/** Role badge colors (Tailwind classes) */
export const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  admin:     { bg: 'bg-coffee-brown',      text: 'text-white' },
  registrar: { bg: 'bg-accent-green-light', text: 'text-accent-green' },
  viewer:    { bg: 'bg-wood-light',         text: 'text-text-muted' },
};

/** Permission helpers */
export const PERMISSIONS = {
  canAddProduct: (role: UserRole) => role === 'admin',
  canDeleteProduct: (role: UserRole) => role === 'admin',
  canRegisterEntry: (role: UserRole) => role === 'admin' || role === 'registrar',
  canRegisterOutput: (role: UserRole) => role === 'admin' || role === 'registrar',
  canViewReports: (_role: UserRole) => true,
  canManageUsers: (role: UserRole) => role === 'admin',
} as const;

/** Application user stored in Supabase app_config */
export interface AppUser {
  id: string;
  username: string;
  role: UserRole;
  pinHash: string;    // SHA-256 of PIN — for authentication only
  wrappedKey: string; // Master encryption key wrapped with this user's PIN-derived key (base64)
}

/** Zod schema for AppUser validation */
export const AppUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(30),
  role: UserRoleSchema,
  pinHash: z.string().length(64), // SHA-256 hex is 64 chars
  wrappedKey: z.string().min(1),
});
