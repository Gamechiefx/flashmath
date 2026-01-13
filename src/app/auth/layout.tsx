import { redirect } from "next/navigation";
import { isMaintenanceMode, getSystemSetting, canBypassMaintenance } from "@/lib/actions/system";

/**
 * Enforces maintenance-mode gating for authentication routes and renders `children` when access is permitted.
 *
 * When the system is in maintenance mode this layout checks whether the current user can bypass maintenance;
 * if not, it initiates a redirect to the home page with a maintenance flag.
 *
 * @param children - The content to render inside this layout when access is allowed
 * @returns A JSX fragment that renders `children` when access is permitted; otherwise a redirect to `/?maintenance=1` is initiated.
 */
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