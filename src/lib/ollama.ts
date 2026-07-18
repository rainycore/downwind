// Local Gemma vision via Ollama. Used only in the precompute step (scripts/
// evidence.ts) — the laptop has Ollama, production (Vercel) never does, so the
// interpretations are cached in Atlas and read back at request time.
//
// Model choice: on an 8 GB Apple-silicon machine, gemma3:4b is the right call —
// it's the smallest *multimodal* Gemma 3 (gemma3:1b has no vision; 12b/27b swap
// hard on 8 GB). Override with OLLAMA_MODEL if you have the headroom.

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b";

export type PairInterpretation = {
  observable: string; // what's visible that changed, e.g. "forest cover", "burn scars", "haze"
  summary: string; // one-paragraph read of the before→after change
  direction: "improved" | "degraded" | "mixed" | "no_change";
  confidence: "high" | "medium" | "low";
};

// Is a local Ollama server reachable?
export async function ollamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

function stripToJson(text: string): string {
  // Gemma sometimes wraps JSON in ```json fences or prose; extract the object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

// Interpret a before/after satellite image pair with local Gemma vision.
// Returns null on any failure so the caller can fall back to text evidence.
export async function interpretImagePair(opts: {
  beforeB64: string;
  afterB64: string;
  context: string; // region, event, observable, and the two dates
  timeoutMs?: number;
}): Promise<PairInterpretation | null> {
  const { beforeB64, afterB64, context, timeoutMs = 180_000 } = opts;

  const prompt = `You are a remote-sensing analyst. You are shown TWO satellite images of the same region: image 1 is BEFORE, image 2 is AFTER.

${context}

Compare them and report ONLY what is visually observable in the imagery (do not speculate beyond what you can see). Respond as strict JSON with these keys:
{
  "observable": "the feature that changed (e.g. forest cover, burn scars, haze/smoke, water extent)",
  "summary": "1-3 sentences describing the before -> after change you can see",
  "direction": "improved | degraded | mixed | no_change (environmentally)",
  "confidence": "high | medium | low (based on cloud cover / clarity)"
}`;

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.2 },
        messages: [{ role: "user", content: prompt, images: [beforeB64, afterB64] }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(stripToJson(content)) as Partial<PairInterpretation>;
    if (!parsed.summary) return null;
    return {
      observable: parsed.observable ?? "surface change",
      summary: parsed.summary,
      direction: parsed.direction ?? "mixed",
      confidence: parsed.confidence ?? "low",
    };
  } catch {
    return null;
  }
}
