import { create } from 'zustand';
import type { AppRole, AppUser } from '@/domain/models';

type AuthState = {
  user: AppUser | null;
  signIn: (role: AppRole) => void;
  signOut: () => void;
};

const roleNames: Record<AppRole, string> = { owner: 'Farouk Manar', manager: 'Salma Benali', 'front-desk': 'Yasmine Alaoui', housekeeping: 'Omar Idrissi' };
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  signIn: (role) => set({ user: { id: `demo-${role}`, name: roleNames[role], role } }),
  signOut: () => set({ user: null }),
}));
