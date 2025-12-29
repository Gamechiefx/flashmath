// Deployment Sync: 2025-12-25T21:06:34Z
import { auth } from "@/auth";
import { HomeView } from "@/components/home-view";
import { isMaintenanceMode, getSystemSetting } from "@/lib/actions/system";

export default async function Home() {
  const session = await auth();
  const maintenance = await isMaintenanceMode();
  const maintenanceMessage = maintenance ? await getSystemSetting('maintenance_message') : null;

  return <HomeView session={session} maintenanceMode={maintenance} maintenanceMessage={maintenanceMessage} />;
}
