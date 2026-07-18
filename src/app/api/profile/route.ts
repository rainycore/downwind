import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getProfile, saveProfile, parseProfileInput } from "@/lib/profile";

export const runtime = "nodejs";

// Read the signed-in reader's profile (null if they haven't onboarded yet).
export async function GET() {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const profile = await getProfile(session.user.sub);
  return NextResponse.json({ profile });
}

// Save/update the reader's profile from the onboarding form.
export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = parseProfileInput(body);
  if (!input) {
    return NextResponse.json({ error: "Please provide a role, location, and reading level." }, { status: 400 });
  }

  const profile = await saveProfile(session.user.sub, input);
  return NextResponse.json({ profile });
}
