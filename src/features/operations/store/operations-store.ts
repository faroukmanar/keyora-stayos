import { create } from 'zustand';
import { housekeepingTasks, reservations, rooms } from '@/data/demo-data';
import type { HousekeepingTask, Reservation, Room, RoomStatus, TaskStatus } from '@/domain/models';

type OperationsState = {
  rooms: Room[];
  reservations: Reservation[];
  tasks: HousekeepingTask[];
  setRoomStatus: (id: string, status: RoomStatus) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
};

export const useOperationsStore = create<OperationsState>((set) => ({
  rooms,
  reservations,
  tasks: housekeepingTasks,
  setRoomStatus: (id, status) => set((state) => ({ rooms: state.rooms.map((room) => room.id === id ? { ...room, status } : room) })),
  setTaskStatus: (id, status) => set((state) => ({ tasks: state.tasks.map((task) => task.id === id ? { ...task, status } : task) })),
}));
