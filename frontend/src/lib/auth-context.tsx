'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from './api';

interface AuthState {
  user: api.User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const storeTokens = (t: api.TokenResponse) => {
    localStorage.setItem('access_token', t.access_token);
    localStorage.setItem('refresh_token', t.refresh_token);
    setUser(t.user);
  };

  const clearTokens = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    storeTokens(tokens);
  }, []);

  const register = useCallback(async (email: string, password: string, display_name?: string) => {
    const tokens = await api.register(email, password, display_name);
    storeTokens(tokens);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    api.getMe()
      .then(setUser)
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
