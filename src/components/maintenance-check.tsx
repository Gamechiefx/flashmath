import { redirect } from "next/navigation";
import { isMaintenanceMode, canBypassMaintenance } from "@/lib/actions/system";

interface MaintenanceCheckProps {
    children: React.ReactNode;
}

export async function MaintenanceCheck({ children }: MaintenanceCheckProps) {
    const maintenance = await isMaintenanceMode();

    if (maintenance) {
        const canBypass = await canBypassMaintenance();
        if (!canBypass) {
            redirect("/maintenance");
        }
    }

    return <>{children}</>;
}
