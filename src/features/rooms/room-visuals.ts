import type { ImageSource } from 'expo-image';

// Bundled placeholders until property media is served from object storage (see docs/operations/inventory.md).
const placeholders: ImageSource[] = [
  require('../../../assets/images/atlas-suite.webp'),
  require('../../../assets/images/fez-junior-suite.webp'),
  require('../../../assets/images/marrakech-family-suite.webp'),
  require('../../../assets/images/casablanca-penthouse.webp'),
  require('../../../assets/images/tangier-twin.webp'),
  require('../../../assets/images/rabat-apartment.webp'),
  require('../../../assets/images/essaouira-private.webp'),
  require('../../../assets/images/corniche-loft.webp'),
];

/** Stable per-room placeholder so the same room always shows the same image. */
export function roomImage(roomId: string): ImageSource {
  let hash = 0;
  for (const char of roomId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return placeholders[hash % placeholders.length];
}
