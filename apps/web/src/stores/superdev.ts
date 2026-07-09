import { create } from 'zustand';
import { sdApi } from '../lib/superdevApi';

interface SuperDevState {
  email: string | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Restore an existing super-dev session from the httpOnly cookie on load. */
  bootstrap: () => Promise<void>;
}

export const useSuperDev = create<SuperDevState>((set) => ({
  email: null,
  status: 'loading',

  login: async (email, password) => {
    const res = await sdApi.post<{ email: string }>('/login', { email, password });
    set({ email: res.email, status: 'authenticated' });
  },

  logout: async () => {
    try {
      await sdApi.post('/logout');
    } finally {
      set({ email: null, status: 'anonymous' });
    }
  },

  bootstrap: async () => {
    try {
      const res = await sdApi.get<{ email: string }>('/me');
      set({ email: res.email, status: 'authenticated' });
    } catch {
      set({ email: null, status: 'anonymous' });
    }
  },
}));
