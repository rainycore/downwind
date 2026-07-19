"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  READER_ROLES,
  EDUCATION_LEVELS,
  EDUCATION_LABELS,
  type ReaderRole,
  type EducationLevel,
} from "@/lib/reader";

const ROLE_COPY: Record<ReaderRole, { label: string; hint: string }> = {
  lawmaker: { label: "Lawmaker / policy staff", hint: "Leads with mechanisms, confidence, and citations." },
  citizen: { label: "Citizen", hint: "Leads with what it means for your daily life." },
};

// Collected once, right after sign-in. Drives who every analysis is written for
// and — the whole point of Downwind — grounds impact where the reader lives.
export default function Onboarding() {
  const router = useRouter();
  const [role, setRole] = useState<ReaderRole>("citizen");
  const [location, setLocation] = useState("");
  const [education, setEducation] = useState<EducationLevel>("high_school");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, location, education }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save profile");
      router.refresh(); // page.tsx re-reads the profile and shows the analyzer
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-6 shadow-sm backdrop-blur-md sm:p-8">
      <h2 className="text-lg font-semibold">Tell us who&apos;s reading</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        A policy enacted anywhere can reach you on the wind, water, or trade — Toronto&apos;s
        wildfire smoke drifted into New York. We tailor every analysis to you and ground it
        where you live.
      </p>

      <div className="mt-6 space-y-6">
        {/* Role */}
        <fieldset>
          <legend className="text-sm font-medium">I&apos;m a…</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {READER_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg border p-3 text-left text-sm ${
                  role === r
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <span className="font-medium">{ROLE_COPY[r].label}</span>
                <span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-300">{ROLE_COPY[r].hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Location */}
        <div>
          <label htmlFor="loc" className="text-sm font-medium">
            Where do you live?
          </label>
          <input
            id="loc"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. New York City, USA"
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
            We use this to show how a distant policy&apos;s effects travel to you.
          </p>
        </div>

        {/* Education / reading level */}
        <div>
          <label htmlFor="edu" className="text-sm font-medium">
            How should we explain things?
          </label>
          <select
            id="edu"
            value={education}
            onChange={(e) => setEducation(e.target.value as EducationLevel)}
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            {EDUCATION_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl} className="bg-[var(--surface)] text-[var(--foreground)]">
                {EDUCATION_LABELS[lvl]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="rounded-md bg-rose-100 p-3 text-sm text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={saving || location.trim().length < 2}
          className="rounded-full border-2 border-[var(--accent-edge)] bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-fg)] shadow-[0_4px_0_0_var(--accent-edge)] transition-all active:translate-y-[4px] active:shadow-none disabled:opacity-50"
        >
          {saving ? "Saving…" : "Start analyzing"}
        </button>
      </div>
    </div>
  );
}
