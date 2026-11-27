/**
 * Maintenance mode check for server pages (SERVER ONLY).
 * Returns the message to show, or null when the page should render normally.
 */
import { getSettings } from '@/lib/settings';

export async function maintenanceMessage(area: 'guest' | 'booth'): Promise<string | null> {
  const { maintenance } = await getSettings();
  if (!maintenance.enabled) return null;
  if (area === 'booth' && maintenance.keepBooth) return null;
  return maintenance.message;
}
