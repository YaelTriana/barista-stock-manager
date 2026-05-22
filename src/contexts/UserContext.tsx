import React, { createContext, useContext } from 'react';
import type { UserRole } from '../schemas/user';

interface UserContextValue {
  username: string;
  role: UserRole;
  userId: string;
  masterKey: CryptoKey | null;
}

export const UserContext = createContext<UserContextValue>({
  username: '',
  role: 'viewer',
  userId: '',
  masterKey: null,
});

export const useCurrentUser = () => useContext(UserContext);

export const UserProvider: React.FC<{
  children: React.ReactNode;
  username: string;
  role: UserRole;
  userId: string;
  masterKey: CryptoKey | null;
}> = ({ children, username, role, userId, masterKey }) => (
  <UserContext.Provider value={{ username, role, userId, masterKey }}>
    {children}
  </UserContext.Provider>
);
