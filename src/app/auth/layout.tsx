import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isMaintenanceMode, canBypassMaintenance } from "@/lib/actions/system";

export default async function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Check maintenance mode - block auth during maintenance (except for admin bypass)
    const maintenance = await isMaintenanceMode();

    if (maintenance) {
        // Get current path to allow login page during maintenance
        // This allows admins to log in even when the site is in maintenance mode
        const headersList = await headers();
        const pathname = headersList.get("x-pathname") || headersList.get("x-invoke-path") || "";
        
        // Always allow access to login page during maintenance
        // After successful login, admins will have a session and can bypass maintenance elsewhere
        const isLoginPage = pathname.includes("/auth/login") || pathname === "/auth/login";
        
        if (!isLoginPage) {
            // For non-login auth pages, check if user can bypass
            const canBypass = await canBypassMaintenance();
            if (!canBypass) {
                // Redirect to home with maintenance banner instead of blocking completely
                redirect("/?maintenance=1");
            }
        }
        // Login page is always accessible during maintenance so admins can authenticate
    }

    return <>{children}</>;
}
