import { Slot } from 'expo-router';
import { RoleGuard } from '@/shared/components/role-guard';
import { WebOperationsLayout } from '@/shared/navigation/web-operations-layout';

export default function WebTabsLayout() {
  return <RoleGuard roles={['owner', 'manager', 'front-desk', 'housekeeping']}><WebOperationsLayout><Slot /></WebOperationsLayout></RoleGuard>;
}
