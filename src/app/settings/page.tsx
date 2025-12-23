import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SettingsView } from "@/components/settings-view";

export default async function SettingsPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/");
    }

    return <SettingsView user={session.user} />;
}
