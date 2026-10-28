import { create } from 'zustand';
import { housekeepingTasks, reservations, rooms } from '@/data/demo-data';
import { canTransitionReservation } from '@/domain/operations';
import type { HousekeepingTask, Reservation, ReservationStatus, Room, RoomStatus, TaskStatus } from '@/domain/models';

type OperationsState = {
  rooms: Room[];
  reservations: Reservation[];
  tasks: HousekeepingTask[];
  createReservation: (reservation: Reservation) => void;
  transitionReservation: (id: string, status: ReservationStatus) => void;
  setRoomStatus: (id: string, status: RoomStatus) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
};

export const useOperationsStore = create<OperationsState>((set) => ({
  rooms,
  reservations,
  tasks: housekeepingTasks,
  createReservation: (reservation) => set((state) => ({ reservations: [reservation, ...state.reservations] })),
  transitionReservation: (id, status) => set((state) => {
    const reservation = state.reservations.find((item) => item.id === id);
    if (!reservation || !canTransitionReservation(reservation.status, status)) return state;
    const nextReservations = state.reservations.map((item) => item.id === id ? { ...item, status } : item);
    if (status === 'checked-in') return { reservations: nextReservations, rooms: state.rooms.map((room) => room.id === reservation.roomId ? { ...room, status: 'occupied' } : room) };
    if (status === 'cancelled') return { reservations: nextReservations, rooms: state.rooms.map((room) => room.id === reservation.roomId && room.status !== 'maintenance' ? { ...room, status: 'available' } : room) };
    const taskId = `hk-${reservation.id.toLowerCase()}`;
    const alreadyQueued = state.tasks.some((task) => task.id === taskId);
    return {
      reservations: nextReservations,
      rooms: state.rooms.map((room) => room.id === reservation.roomId ? { ...room, status: 'cleaning' } : room),
      tasks: alreadyQueued ? state.tasks : [{ id: taskId, roomId: reservation.roomId, assignee: 'Unassigned', due: 'Next arrival', status: 'ready', priority: 'rush' }, ...state.tasks],
    };
  }),
  setRoomStatus: (id, status) => set((state) => ({ rooms: state.rooms.map((room) => room.id === id ? { ...room, status } : room) })),
  setTaskStatus: (id, status) => set((state) => ({ tasks: state.tasks.map((task) => task.id === id ? { ...task, status } : task) })),
}));
