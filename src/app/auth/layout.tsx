import { redirect } from "next/navigation";
import { isMaintenanceMode, getSystemSetting, canBypassMaintenance } from "@/lib/actions/system";

export default async function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Check maintenance mode - block auth during maintenance (except for admin bypass)
    const maintenance = await isMaintenanceMode();

    if (maintenance) {
        const canBypass = await canBypassMaintenance();
        if (!canBypass) {
            // Redirect to home with maintenance banner instead of blocking completely
            redirect("/?maintenance=1");
        }
    }

    return <>{children}</>;
}
