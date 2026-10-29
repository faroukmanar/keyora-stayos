import { ApiReservationsRepository, ApiRoomsRepository } from './api-repositories';
import { DemoReservationsRepository, DemoRoomsRepository } from './demo-repositories';
import { HttpClient } from '@/services/http/http-client';

export function createRepositories(options: { apiUrl: string; dataSource?: 'api' | 'demo' }) {
  const dataSource = options.dataSource ?? (process.env.EXPO_PUBLIC_DATA_SOURCE === 'demo' ? 'demo' : 'api');
  if (dataSource === 'demo') {
    if (!__DEV__) throw new Error('The demo adapter is forbidden in production builds.');
    return { rooms: new DemoRoomsRepository(), reservations: new DemoReservationsRepository(), http: null };
  }
  const http = new HttpClient({ baseUrl: options.apiUrl });
  return { rooms: new ApiRoomsRepository(http), reservations: new ApiReservationsRepository(http), http };
}
