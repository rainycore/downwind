import { GoogleGenAI } from "@google/genai";
import type { Usage } from "./greenai";

// Single Gemini client. Model tiers come from env so the Green-AI story
// (cheap Flash/Gemma for extraction, Pro only for multimodal synthesis) is
// configurable without code changes.
const apiKey = process.env.GEMINI_API_KEY;

export const MODELS = {
  extract: process.env.GEMINI_MODEL_EXTRACT ?? "gemini-flash-latest",
  // Vision + synthesis. The plan specifies FLASH for the vision pass
  // (~$0.0006/pair); gemini-2.5-pro is unavailable on the free tier (limit: 0),
  // so default to flash and let a paid tier opt into pro via env.
  synth: process.env.GEMINI_MODEL_SYNTH ?? "gemini-flash-latest",
  fallback: process.env.GEMINI_MODEL_FALLBACK ?? "gemma-3-27b-it",
  embed: "gemini-embedding-001",
} as const;

let _client: GoogleGenAI | null = null;
export function gemini(): GoogleGenAI {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Copy .env.example to .env.local.");
  _client ??= new GoogleGenAI({ apiKey });
  return _client;
}

// Pull usage off a response for the carbon receipt.
export function usageOf(model: string, resp: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }): Usage {
  return {
    model,
    promptTokens: resp.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

// Embed text for MongoDB Atlas Vector Search. `gemini-embedding-001` returns
// 3072-dim vectors by default; we request 768 to keep the index small/fast.
export const EMBED_DIM = 768;

export async function embed(text: string): Promise<number[]> {
  const resp = await gemini().models.embedContent({
    model: MODELS.embed,
    contents: text,
    config: { outputDimensionality: EMBED_DIM },
  });
  const values = resp.embeddings?.[0]?.values;
  if (!values) throw new Error("Embedding failed: no values returned.");
  return values;
}
