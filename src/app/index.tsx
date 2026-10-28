import { Redirect } from 'expo-router';
import { useAuthStore } from '@/features/auth/store/auth-store';
export default function Index() { const user = useAuthStore((state) => state.user); return <Redirect href={user ? '/dashboard' : '/sign-in'} />; }
