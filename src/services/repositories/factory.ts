import { ApiGuestsRepository, ApiMaintenanceRepository, ApiQuotesRepository, ApiReservationsRepository, ApiRoomsRepository } from './api-repositories';
import { ApiHousekeepingRepository } from './housekeeping-repository';
import { HttpClient } from '@/services/http/http-client';

/** Every client build talks to the versioned API; there is no in-app demo data source. */
export function createRepositories(options: { apiUrl: string }) {
  const http = new HttpClient({ baseUrl: options.apiUrl });
  return {
    http,
    rooms: new ApiRoomsRepository(http),
    reservations: new ApiReservationsRepository(http),
    guests: new ApiGuestsRepository(http),
    quotes: new ApiQuotesRepository(http),
    maintenance: new ApiMaintenanceRepository(http),
    housekeeping: new ApiHousekeepingRepository(http),
  };
}
