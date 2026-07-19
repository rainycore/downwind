import type { ProvenanceTag } from "@/lib/taxonomy";
import { Badge, type Tone } from "./Badge";

// Maps the contract's PROVENANCE_TAG onto the existing Badge tone vocabulary so
// OBSERVED / MODELED / LLM_NARRATIVE read as one system everywhere they appear.
// This IS the credibility layer made visible (plan.md L314) — every rendered
// number carries the tag that says where it came from.
const PROVENANCE: Record<ProvenanceTag, { tone: Tone; label: string }> = {
  OBSERVED: { tone: "observed", label: "observed" }, // tool-derived, real measurement
  MODELED: { tone: "extrapolated", label: "modeled" }, // counterfactual / extrapolation + cite
  LLM_NARRATIVE: { tone: "speculative", label: "narrative" }, // model prose, not a measurement
};

export function ProvenanceBadge({
  tag,
  className = "",
}: {
  tag: ProvenanceTag;
  className?: string;
}) {
  const p = PROVENANCE[tag];
  return (
    <Badge tone={p.tone} className={className}>
      {p.label}
    </Badge>
  );
}
