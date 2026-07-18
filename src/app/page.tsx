import { auth0 } from "@/lib/auth0";
import { getProfile } from "@/lib/profile";
import AppShell, { type ShellUser } from "@/components/AppShell";
import Hero from "@/components/Hero";
import Analyzer from "./analyzer";
import Onboarding from "./onboarding";

export default async function Home() {
  const session = await auth0.getSession();
  const user = session?.user;
  // Analyses are tailored to the reader, so we need an onboarded profile.
  const profile = user ? await getProfile(user.sub) : null;

  // Only pass serializable, non-sensitive fields across the server→client boundary.
  const shellUser: ShellUser = user
    ? { email: user.email ?? null, name: user.name ?? null }
    : null;

  // Signed out → Hero. Signed in without a profile → Onboarding. Otherwise the
  // analyzer, rendered on the server and slotted into the client AppShell.
  const content = !user ? (
    <Hero />
  ) : profile ? (
    <Analyzer profile={profile} />
  ) : (
    <Onboarding />
  );

  return <AppShell user={shellUser}>{content}</AppShell>;
}
