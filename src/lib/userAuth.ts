/**
 * User authentication and management for Barista Stock Manager.
 * Users are stored in Supabase app_config as a JSON array.
 * Master encryption key is wrapped per-user with their PIN-derived key.
 */

import { supabase } from './supabase';
import {
  hashPin,
  generateSalt,
  deriveKey,
  deriveWrappingKey,
  wrapMasterKey,
  unwrapMasterKey,
} from './crypto';
import type { AppUser, UserRole } from '../schemas/user';

// ─── CONSTANTS ───

const USERS_CONFIG_KEY = 'users';
const MASTER_SALT_KEY = 'salt'; // Keep old key name for backwards compatibility

// ─── SUPABASE HELPERS ───

async function getConfig(key: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .single();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

async function setConfig(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

// ─── SALT MANAGEMENT ───

export async function getMasterSalt(): Promise<string | null> {
  return getConfig(MASTER_SALT_KEY);
}

// ─── USER CRUD ───

/** Load all users from Supabase */
export async function loadUsers(): Promise<AppUser[]> {
  const raw = await getConfig(USERS_CONFIG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AppUser[];
  } catch {
    return [];
  }
}

/** Persist all users to Supabase */
async function saveUsers(users: AppUser[]): Promise<void> {
  await setConfig(USERS_CONFIG_KEY, JSON.stringify(users));
}

// ─── SYSTEM DETECTION ───

/** Detect what state the app is in on load */
export type AppSetupState =
  | 'loading'
  | 'fresh'       // No config at all — first ever launch
  | 'migration'   // Old single-PIN system detected, needs migration
  | 'ready';      // Multi-user system is set up

export async function detectSetupState(): Promise<AppSetupState> {
  try {
    const [saltRaw, usersRaw, pinHashRaw] = await Promise.all([
      getConfig(MASTER_SALT_KEY),
      getConfig(USERS_CONFIG_KEY),
      getConfig('pin_hash'),
    ]);

    if (!saltRaw) return 'fresh';                  // Truly fresh install
    if (saltRaw && pinHashRaw && !usersRaw) return 'migration'; // Old system
    if (saltRaw && usersRaw) return 'ready';        // New multi-user system
    return 'fresh';
  } catch {
    return 'fresh';
  }
}

// ─── FIRST-TIME SETUP (Admin) ───

/**
 * Initialize the system for the first time with an admin user.
 * Creates master salt, derives master encryption key, wraps it for admin.
 * @returns The admin user object and the master CryptoKey
 */
export async function setupFirstAdmin(
  username: string,
  pin: string
): Promise<{ user: AppUser; masterKey: CryptoKey }> {
  // Generate master salt and derive master key (used for all data encryption)
  const salt = generateSalt();
  const masterKey = await deriveKey(pin, salt);

  // Derive wrapping key for admin and wrap master key
  const wrappingKey = await deriveWrappingKey(pin, salt);
  const wrappedKey = await wrapMasterKey(masterKey, wrappingKey);

  // Hash admin PIN for authentication
  const pinHash = await hashPin(pin);

  const adminUser: AppUser = {
    id: crypto.randomUUID(),
    username,
    role: 'admin',
    pinHash,
    wrappedKey,
  };

  // Store salt, users array, and clean up old pin_hash if it exists
  await Promise.all([
    setConfig(MASTER_SALT_KEY, salt),
    saveUsers([adminUser]),
  ]);

  // Remove old single-user pin_hash if it exists
  try {
    await supabase.from('app_config').delete().eq('key', 'pin_hash');
  } catch { /* ignore */ }

  return { user: adminUser, masterKey };
}

// ─── MIGRATION (Old single-PIN → Multi-user) ───

/**
 * Migrate from old single-PIN system to multi-user system.
 * Verifies old PIN, creates admin user with wrapped master key.
 */
export async function migrateToMultiUser(
  username: string,
  pin: string
): Promise<{ user: AppUser; masterKey: CryptoKey } | null> {
  const [saltRaw, pinHashRaw] = await Promise.all([
    getConfig(MASTER_SALT_KEY),
    getConfig('pin_hash'),
  ]);

  if (!saltRaw || !pinHashRaw) return null;

  // Verify old PIN
  const enteredHash = await hashPin(pin);
  if (enteredHash !== pinHashRaw) return null; // Wrong PIN

  // Derive master key (same algorithm as before — data remains compatible)
  const masterKey = await deriveKey(pin, saltRaw);

  // Wrap for admin user
  const wrappingKey = await deriveWrappingKey(pin, saltRaw);
  const wrappedKey = await wrapMasterKey(masterKey, wrappingKey);

  const adminUser: AppUser = {
    id: crypto.randomUUID(),
    username,
    role: 'admin',
    pinHash: enteredHash,
    wrappedKey,
  };

  await Promise.all([
    saveUsers([adminUser]),
    supabase.from('app_config').delete().eq('key', 'pin_hash'), // Clean up old key
  ]);

  return { user: adminUser, masterKey };
}

// ─── LOGIN ───

/**
 * Authenticate a user with their PIN and unwrap the master encryption key.
 * @returns { user, masterKey } on success, null on failure
 */
export async function loginUser(
  username: string,
  pin: string
): Promise<{ user: AppUser; masterKey: CryptoKey } | null> {
  const [saltRaw, users] = await Promise.all([
    getMasterSalt(),
    loadUsers(),
  ]);

  if (!saltRaw) return null;

  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return null;

  // Verify PIN
  const enteredHash = await hashPin(pin);
  if (enteredHash !== user.pinHash) return null;

  // Unwrap master key
  const wrappingKey = await deriveWrappingKey(pin, saltRaw);
  const masterKey = await unwrapMasterKey(user.wrappedKey, wrappingKey);

  return { user, masterKey };
}

// ─── USER MANAGEMENT (Admin only) ───

/**
 * Add a new user. Requires the master key in memory (from admin's session).
 * The master key is wrapped with the new user's PIN-derived key.
 */
export async function addUser(
  username: string,
  role: UserRole,
  pin: string,
  masterKey: CryptoKey
): Promise<AppUser> {
  const [saltRaw, users] = await Promise.all([
    getMasterSalt(),
    loadUsers(),
  ]);

  if (!saltRaw) throw new Error('Master salt not found');

  // Check username uniqueness
  const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) throw new Error(`El usuario "${username}" ya existe`);

  const pinHash = await hashPin(pin);
  const wrappingKey = await deriveWrappingKey(pin, saltRaw);
  const wrappedKey = await wrapMasterKey(masterKey, wrappingKey);

  const newUser: AppUser = {
    id: crypto.randomUUID(),
    username,
    role,
    pinHash,
    wrappedKey,
  };

  await saveUsers([...users, newUser]);
  return newUser;
}

/**
 * Remove a user by ID. Cannot remove the last admin.
 */
export async function removeUser(userId: string): Promise<void> {
  const users = await loadUsers();
  const remaining = users.filter(u => u.id !== userId);

  // Safety check: at least one admin must remain
  const adminCount = remaining.filter(u => u.role === 'admin').length;
  if (adminCount === 0) throw new Error('Debe haber al menos un administrador');

  await saveUsers(remaining);
}

/**
 * Change a user's PIN. Requires the master key to re-wrap it with the new PIN.
 */
export async function changeUserPin(
  userId: string,
  newPin: string,
  masterKey: CryptoKey
): Promise<void> {
  const [saltRaw, users] = await Promise.all([
    getMasterSalt(),
    loadUsers(),
  ]);

  if (!saltRaw) throw new Error('Master salt not found');

  const userIdx = users.findIndex(u => u.id === userId);
  if (userIdx === -1) throw new Error('Usuario no encontrado');

  const newPinHash = await hashPin(newPin);
  const newWrappingKey = await deriveWrappingKey(newPin, saltRaw);
  const newWrappedKey = await wrapMasterKey(masterKey, newWrappingKey);

  const updatedUsers = [...users];
  updatedUsers[userIdx] = {
    ...updatedUsers[userIdx]!,
    pinHash: newPinHash,
    wrappedKey: newWrappedKey,
  };

  await saveUsers(updatedUsers);
}
