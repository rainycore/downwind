import { auth0 } from "@/lib/auth0";
import AppShell, { type ShellUser } from "@/components/AppShell";
import Hero from "@/components/Hero";
import Analyzer from "./analyzer";
import { DEV_AUTH_BYPASS } from "@/lib/devAuth";

export default async function Home() {
  const session = await auth0.getSession();
  const user = session?.user;

  // Show the analyzer when signed in, or under the dev-only auth bypass.
  const showAnalyzer = !!user || DEV_AUTH_BYPASS;

  // Only pass serializable, non-sensitive fields across the server→client boundary.
  const shellUser: ShellUser = user
    ? { email: user.email ?? null, name: user.name ?? null }
    : DEV_AUTH_BYPASS
      ? { email: "dev bypass (local only)", name: null }
      : null;

  return (
    <AppShell user={shellUser}>{showAnalyzer ? <Analyzer /> : <Hero />}</AppShell>
  );
}
