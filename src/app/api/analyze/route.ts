import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { analyzePolicy } from "@/lib/pipeline";
import { getProfile } from "@/lib/profile";

export const runtime = "nodejs";
// The uncached pipeline makes ~6 sequential Gemini calls (extract, re-rank,
// vision, horizons, personalize) + a sidecar EO round-trip. On the free tier
// (flash) that can take 2-3 min the first time; cached hero-case runs are
// instant. Give the first-touch path room so it doesn't hard-fail.
export const maxDuration = 300;

export async function POST(request: Request) {
  // Auth0-gated: only signed-in users can run (and thus cost) an analysis.
  const session = await auth0.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let policy: string;
  try {
    const body = await request.json();
    policy = (body.policy ?? "").toString();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (policy.trim().length < 20) {
    return NextResponse.json({ error: "Policy text is too short." }, { status: 400 });
  }

  // Analyses are tailored to the reader; require an onboarded profile.
  const profile = await getProfile(session.user.sub);
  if (!profile) {
    return NextResponse.json({ error: "Complete your profile before running an analysis.", needsProfile: true }, { status: 428 });
  }

  try {
    const result = await analyzePolicy(policy, profile);
    return NextResponse.json(result);
  } catch (err) {
    console.error("analyze failed:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
