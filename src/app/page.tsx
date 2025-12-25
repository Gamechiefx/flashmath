// Deployment Sync: 2025-12-25T20:49:03Z
import { auth } from "@/auth";
import { HomeView } from "@/components/home-view";

export default async function Home() {
  const session = await auth();

  return <HomeView session={session} />;
}

