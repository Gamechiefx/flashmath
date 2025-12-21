import { auth } from "@/auth";
import { HomeView } from "@/components/home-view";

export default async function Home() {
  const session = await auth();

  return <HomeView session={session} />;
}
