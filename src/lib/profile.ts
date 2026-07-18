import { createHash } from "node:crypto";
import { getDb, COLLECTIONS } from "./mongodb";
import {
  READER_ROLES,
  EDUCATION_LEVELS,
  type UserProfile,
  type ReaderRole,
  type EducationLevel,
} from "./schemas";

// What the onboarding form submits (everything but the server-owned fields).
export type ProfileInput = {
  role: ReaderRole;
  location: string;
  education: EducationLevel;
};

// Validate/normalize untrusted form input into a ProfileInput, or null.
export function parseProfileInput(body: unknown): ProfileInput | null {
  if (!body || typeof body !== "object") return null;
  const { role, location, education } = body as Record<string, unknown>;
  const loc = typeof location === "string" ? location.trim() : "";
  if (!READER_ROLES.includes(role as ReaderRole)) return null;
  if (!EDUCATION_LEVELS.includes(education as EducationLevel)) return null;
  if (loc.length < 2 || loc.length > 120) return null;
  return { role: role as ReaderRole, location: loc, education: education as EducationLevel };
}

export async function getProfile(sub: string): Promise<UserProfile | null> {
  const db = await getDb();
  return db.collection<UserProfile>(COLLECTIONS.profiles).findOne({ sub }, { projection: { _id: 0 } });
}

export async function saveProfile(sub: string, input: ProfileInput): Promise<UserProfile> {
  const db = await getDb();
  const now = new Date().toISOString();
  const profile: UserProfile = { sub, ...input, createdAt: now, updatedAt: now };
  await db.collection<UserProfile>(COLLECTIONS.profiles).updateOne(
    { sub },
    // Preserve the original createdAt on updates; refresh everything else.
    { $set: { sub, ...input, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
  return profile;
}

// The tailoring inputs that actually change the output — used to key the
// personalization cache so two readers never see each other's tailored text.
export function profileHash(p: Pick<UserProfile, "role" | "location" | "education">): string {
  return createHash("sha256")
    .update(`${p.role}|${p.education}|${p.location.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}
