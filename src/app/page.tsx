// Deployment Sync: 2025-12-25T21:06:34Z
import { auth } from "@/auth";
import { HomeView } from "@/components/home-view";
import { isMaintenanceMode, getSystemSetting } from "@/lib/actions/system";

/**
 * Render the application's home page with the current session and maintenance information.
 *
 * When maintenance mode is active, the returned view includes the configured maintenance message.
 *
 * @returns A JSX element rendering `HomeView` with the authenticated session, a `maintenanceMode` boolean, and `maintenanceMessage` (string or `null`).
 */
export default async function Home() {
  const session = await auth();
  const maintenance = await isMaintenanceMode();
  const maintenanceMessage = maintenance ? await getSystemSetting('maintenance_message') : null;

  return <HomeView session={session} maintenanceMode={maintenance} maintenanceMessage={maintenanceMessage} />;
}