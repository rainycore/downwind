import { auth0 } from "@/lib/auth0";
import { getProfile } from "@/lib/profile";
import Analyzer from "./analyzer";
import Onboarding from "./onboarding";

export default async function Home() {
  const session = await auth0.getSession();
  const user = session?.user;
  const profile = user ? await getProfile(user.sub) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Downwind
            <span className="ml-2 align-middle text-xs font-normal text-neutral-500">
              satellites keep the receipts
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-500">
            Paste a policy. Downwind extracts its hidden environmental levers, retrieves
            enacted policies with <em>observed</em> satellite outcomes, and grounds a 3 / 10 / 30-year
            impact read — labelled by how much we actually know.
          </p>
        </div>
        <nav className="shrink-0 text-sm">
          {user ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-neutral-500">{user.email ?? user.name}</span>
              <a className="underline" href="/auth/logout">
                Log out
              </a>
            </div>
          ) : (
            <a
              className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white"
              href="/auth/login"
            >
              Sign in
            </a>
          )}
        </nav>
      </header>

      {user ? (
        profile ? (
          <Analyzer profile={profile} />
        ) : (
          <Onboarding />
        )
      ) : (
        <div className="rounded-lg border border-neutral-200 p-8 text-center dark:border-neutral-800">
          <p className="text-neutral-600 dark:text-neutral-400">
            Sign in (passwordless magic-link) to run an analysis.
          </p>
          <a
            className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 font-medium text-white"
            href="/auth/login"
          >
            Sign in to start
          </a>
        </div>
      )}
    </main>
  );
}
