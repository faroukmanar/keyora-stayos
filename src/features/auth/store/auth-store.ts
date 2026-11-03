import { create } from 'zustand';
import type { AppRole, AppUser } from '@/domain/models';

type AuthState = {
  user: AppUser | null;
  sessionChecked: boolean;
  signIn: (role: AppRole) => void;
  hydrate: (user: AppUser) => void;
  finishSessionCheck: () => void;
  signOut: () => void;
};

const roleNames: Record<AppRole, string> = { owner: 'Farouk Manar', manager: 'Salma Benali', 'front-desk': 'Yasmine Alaoui', housekeeping: 'Omar Idrissi' };
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionChecked: false,
  signIn: (role) => set({ user: { id: `demo-${role}`, name: roleNames[role], role }, sessionChecked: true }),
  hydrate: (user) => set({ user, sessionChecked: true }),
  finishSessionCheck: () => set({ sessionChecked: true }),
  signOut: () => set({ user: null, sessionChecked: true }),
}));
