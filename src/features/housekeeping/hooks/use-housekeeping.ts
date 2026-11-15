import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { HousekeepingTask, HousekeepingTaskDetail } from '../../../../packages/contracts/src';
import { useAuthStore } from '@/features/auth/store/auth-store';
import type { TaskAction } from '@/features/housekeeping/task-actions';
import { repositories, scopeFor } from '@/services/repositories/live';
import { queryKeys } from '@/services/repositories/query-keys';

// Web receives SSE invalidations; native polls while the screen is mounted.
const nativeRefetchMs = Platform.OS === 'web' ? false : 15_000;

export function useHousekeepingTasks() {
  const scope = scopeFor(useAuthStore((state) => state.user));
  const repository = repositories.housekeeping;
  return useQuery<HousekeepingTask[]>({
    queryKey: scope ? [...queryKeys.housekeeping(scope), 'list'] : ['housekeeping', 'unauthenticated'],
    enabled: Boolean(scope && repository),
    refetchInterval: nativeRefetchMs,
    queryFn: async () => (await repository!.list(scope!)).data,
  });
}

export function useHousekeepingTask(taskId: string | null) {
  const scope = scopeFor(useAuthStore((state) => state.user));
  const repository = repositories.housekeeping;
  return useQuery<HousekeepingTaskDetail>({
    queryKey: scope && taskId ? [...queryKeys.housekeeping(scope), 'detail', taskId] : ['housekeeping', 'detail', 'none'],
    enabled: Boolean(scope && repository && taskId),
    queryFn: () => repository!.get(scope!, taskId!),
  });
}

export function useHousekeepingAction() {
  const queryClient = useQueryClient();
  const scope = scopeFor(useAuthStore((state) => state.user));
  return useMutation({
    mutationFn: async ({ task, action, reason }: { task: Pick<HousekeepingTask, 'id' | 'version'>; action: TaskAction; reason?: string }) => {
      const repository = repositories.housekeeping;
      if (!scope || !repository) throw new Error('Sign in to a live property to update tasks.');
      if (action.kind === 'inspect') return repository.inspect(scope, task.id, { version: task.version, result: action.result });
      if (action.kind === 'escalate') return repository.escalate(scope, task.id, { version: task.version, reason: reason ?? '' });
      return repository.transition(scope, task.id, { version: task.version, target: action.target, ...(reason ? { reason } : {}) });
    },
    onSettled: () => scope ? queryClient.invalidateQueries({ queryKey: queryKeys.housekeeping(scope) }) : undefined,
  });
}

export function useToggleChecklistItem() {
  const queryClient = useQueryClient();
  const scope = scopeFor(useAuthStore((state) => state.user));
  return useMutation({
    mutationFn: async ({ taskId, itemId, completed }: { taskId: string; itemId: string; completed: boolean }) => {
      if (!scope || !repositories.housekeeping) throw new Error('Sign in to a live property to update tasks.');
      return repositories.housekeeping.toggleChecklistItem(scope, taskId, itemId, completed);
    },
    onSettled: () => scope ? queryClient.invalidateQueries({ queryKey: queryKeys.housekeeping(scope) }) : undefined,
  });
}
