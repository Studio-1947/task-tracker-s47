import { create } from 'zustand';
import type { AuthUser } from '@task-tracker/shared';
import { http, setAccessToken } from '../lib/api';

interface AuthState {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Attempt silent session restore via the refresh cookie on app load. */
  bootstrap: () => Promise<void>;
}

interface LoginResp {
  accessToken: string;
  user: AuthUser;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  login: async (email, password) => {
    const res = await http.post<LoginResp>('/auth/login', { email, password });
    setAccessToken(res.accessToken);
    set({ user: res.user, status: 'authenticated' });
  },

  logout: async () => {
    try {
      await http.post('/auth/logout');
    } finally {
      setAccessToken(null);
      set({ user: null, status: 'anonymous' });
    }
  },

  bootstrap: async () => {
    try {
      const res = await http.post<LoginResp>('/auth/refresh');
      setAccessToken(res.accessToken);
      set({ user: res.user, status: 'authenticated' });
    } catch {
      setAccessToken(null);
      set({ user: null, status: 'anonymous' });
    }
  },
}));
