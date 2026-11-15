import { create } from 'zustand';
import type { AppUser } from '@/domain/models';

type AuthState = {
  user: AppUser | null;
  sessionChecked: boolean;
  hydrate: (user: AppUser) => void;
  finishSessionCheck: () => void;
  signOut: () => void;
};

/** Holds the authenticated actor only; sessions are established through the API (see native-session.ts and sign-in-screen.web.tsx). */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionChecked: false,
  hydrate: (user) => set({ user, sessionChecked: true }),
  finishSessionCheck: () => set({ sessionChecked: true }),
  signOut: () => set({ user: null, sessionChecked: true }),
}));
