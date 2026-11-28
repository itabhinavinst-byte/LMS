import React, { createContext, useCallback, useContext, useState } from 'react';
import { apiRequest, setApiToken } from '../lib/api';
import type { AuthUser } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loginAdmin: (identifier: string, password: string) => Promise<AuthUser>;
  setupSuperAdmin: (fullName: string, email: string, password: string) => Promise<AuthUser>;
  loginStudent: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);

  const applySession = useCallback((nextToken: string, nextUser: AuthUser) => {
    setApiToken(nextToken);
    setTokenState(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    setApiToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const loginAdmin = useCallback(
    async (identifier: string, password: string) => {
      const data = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/admin/login', {
        method: 'POST',
        body: { identifier, password },
        token: null,
      });
      applySession(data.token, data.user);
      return data.user;
    },
    [applySession]
  );

  const setupSuperAdmin = useCallback(
    async (fullName: string, email: string, password: string) => {
      const data = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/admin/setup', {
        method: 'POST',
        body: { full_name: fullName, email, password },
        token: null,
      });
      applySession(data.token, data.user);
      return data.user;
    },
    [applySession]
  );

  const loginStudent = useCallback(
    async (identifier: string, password: string) => {
      const data = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/student/login', {
        method: 'POST',
        body: { identifier, password },
        token: null,
      });
      applySession(data.token, data.user);
      return data.user;
    },
    [applySession]
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await apiRequest('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Ignore network error during logout cleanup
    } finally {
      clearSession();
    }
  }, [token, clearSession]);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      clearSession();
    }
  }, [token, clearSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loginAdmin,
        setupSuperAdmin,
        loginStudent,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
