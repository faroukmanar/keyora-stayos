import { Tabs } from 'expo-router';
import { BedDouble, CalendarDays, Gauge, Sparkles, UsersRound } from 'lucide-react-native';
import { RoleGuard } from '@/shared/components/role-guard';
import { tabIcon, tabScreenOptions } from '@/shared/navigation/tab-options';
export default function TabsLayout() { return <RoleGuard roles={['owner', 'manager', 'front-desk', 'housekeeping']}><Tabs screenOptions={tabScreenOptions}><Tabs.Screen name="dashboard" options={{ title: 'Today', tabBarIcon: tabIcon(Gauge) }} /><Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: tabIcon(CalendarDays) }} /><Tabs.Screen name="rooms" options={{ title: 'Rooms', tabBarIcon: tabIcon(BedDouble) }} /><Tabs.Screen name="guests" options={{ title: 'Guests', tabBarIcon: tabIcon(UsersRound) }} /><Tabs.Screen name="housekeeping" options={{ title: 'Service', tabBarIcon: tabIcon(Sparkles) }} /></Tabs></RoleGuard>; }
