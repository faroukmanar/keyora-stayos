import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';
import type { AppRole } from '@/domain/models';
import { useAuthStore } from '@/features/auth/store/auth-store';
export function RoleGuard({ roles, children }: PropsWithChildren<{ roles: AppRole[] }>) { const user = useAuthStore((state) => state.user); if (!user) return <Redirect href="/sign-in" />; if (!roles.includes(user.role)) return <Redirect href="/" />; return children; }
