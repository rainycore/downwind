import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { analyzePolicy } from "@/lib/pipeline";
import { DEV_AUTH_BYPASS } from "@/lib/devAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  // Auth0-gated: only signed-in users can run (and thus cost) an analysis.
  // The dev-only bypass lets local testing hit the pipeline without a tenant.
  const session = await auth0.getSession();
  if (!session && !DEV_AUTH_BYPASS) {
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

  try {
    const result = await analyzePolicy(policy);
    return NextResponse.json(result);
  } catch (err) {
    console.error("analyze failed:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
