import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Location autocomplete for the profile field. Backed by Photon (OSM-based,
// no key, purpose-built for search-as-you-type). Routed server-side so we
// normalize into a clean "City, State, Country" label, keep the components for
// downstream disambiguation, and can swap providers without touching the client.
const PHOTON_URL = "https://photon.komoot.io/api/";

// Photon returns everything down to individual houses/streets; the profile
// wants a *place*, so keep only place-level granularities.
const PLACE_TYPES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "locality",
  "district",
  "county",
  "state",
  "region",
  "province",
  "country",
]);

type PhotonFeature = {
  properties?: {
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
  };
};

export type LocationSuggestion = {
  label: string;
  city?: string;
  state?: string;
  country?: string;
};

// "Toronto" + "Ontario" + "Canada" -> "Toronto, Ontario, Canada", dropping
// empty and repeated parts (a state whose name equals its own region, etc.).
function toLabel(parts: (string | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = p?.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.join(", ");
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  // Too short to be meaningful — return empty rather than hammering Photon.
  if (q.length < 3) return NextResponse.json({ results: [] });

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");

  let data: { features?: PhotonFeature[] };
  try {
    const res = await fetch(url, {
      // Photon is polite about a UA; identify the app.
      headers: { "User-Agent": "Downwind/1.0 (policy-impact autocomplete)" },
      // Provider hiccups shouldn't hang the typeahead.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    data = await res.json();
  } catch {
    // Network/timeout/abort — degrade to no suggestions, never 500 the field.
    return NextResponse.json({ results: [] });
  }

  const seen = new Set<string>();
  const results: LocationSuggestion[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    if (p.type && !PLACE_TYPES.has(p.type)) continue;
    const city = p.city ?? (p.type === "city" || p.type === "town" || p.type === "village" ? p.name : undefined);
    const label = toLabel([p.name ?? city, p.state, p.country]);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue; // Photon can return dupes across OSM objects
    seen.add(key);
    results.push({ label, city, state: p.state, country: p.country });
    if (results.length >= 6) break;
  }

  return NextResponse.json({ results });
}
