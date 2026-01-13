import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SettingsView } from "@/components/settings-view";

export const dynamic = 'force-dynamic';

/**
 * Renders the settings page for the authenticated user and redirects to the home page if no user is signed in.
 *
 * @returns The settings page React element displaying the authenticated user's settings.
 */
export default async function SettingsPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/");
    }

    return <SettingsView user={session.user} />;
}