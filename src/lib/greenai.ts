// Green-AI accounting — the Deloitte "AI for Green" angle.
// We report tokens-per-analysis and cache-hit savings so the demo can show a
// live "carbon receipt". Rough energy/CO2 factors are order-of-magnitude only
// and labelled as estimates in the UI — honesty-in-the-UI is a differentiator.

export type Usage = {
  model: string;
  promptTokens: number;
  outputTokens: number;
};

export type CarbonReceipt = {
  totalTokens: number;
  byModel: Record<string, { promptTokens: number; outputTokens: number }>;
  estWattHours: number;
  estGramsCO2: number;
  cached: boolean;
};

// Order-of-magnitude estimate: ~0.3 Wh per 1k tokens for a served LLM call,
// and ~400 gCO2/kWh grid average. Both are deliberately conservative and
// surfaced as estimates, never precise claims.
const WH_PER_1K_TOKENS = 0.3;
const GRAMS_CO2_PER_WH = 0.4;

export function receiptFrom(usages: Usage[], cached = false): CarbonReceipt {
  const byModel: CarbonReceipt["byModel"] = {};
  let totalTokens = 0;

  for (const u of usages) {
    byModel[u.model] ??= { promptTokens: 0, outputTokens: 0 };
    byModel[u.model].promptTokens += u.promptTokens;
    byModel[u.model].outputTokens += u.outputTokens;
    totalTokens += u.promptTokens + u.outputTokens;
  }

  const estWattHours = (totalTokens / 1000) * WH_PER_1K_TOKENS;
  return {
    totalTokens,
    byModel,
    estWattHours: round(estWattHours, 3),
    estGramsCO2: round(estWattHours * GRAMS_CO2_PER_WH, 3),
    cached,
  };
}

// A cache hit did the work once and reuses it — report ~0 marginal cost.
export function cachedReceipt(original: CarbonReceipt): CarbonReceipt {
  return { ...original, cached: true, estWattHours: 0, estGramsCO2: 0 };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
