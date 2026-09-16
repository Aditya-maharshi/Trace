/**
 * ExplainabilityPanel.tsx (S3)
 *
 * Renders a breakdown of the attribution score formula so investigators
 * can see exactly why a wallet was attributed to a particular VASP.
 * "We're not a black box" — the math is visible, not just the result.
 */
import { Progress } from "@/components/ui/progress";
import type { ScoreBreakdown } from "@/lib/api";

interface ExplainabilityPanelProps {
  breakdown: ScoreBreakdown;
  confidence: string;
  thresholds: { high: number; medium: number };
}

/** Format a USD value for display — e.g. "$48,200" or "$0.12" */
function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${value.toFixed(2)}`;
}

/** Clamp a value between 0 and 100 for the progress bar percentage. */
function toPercent(value: number, max: number): number {
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function ExplainabilityPanel({
  breakdown,
  confidence,
  thresholds,
}: ExplainabilityPanelProps) {
  const taintPct = breakdown.taintFraction * 100;
  const scorePct = toPercent(breakdown.score, 100); 

  const daysSince = breakdown.daysSinceLastTx;
  const daysLabel =
    daysSince < 1
      ? "today"
      : daysSince < 2
        ? "yesterday"
        : `${Math.round(daysSince)} days ago`;

  return (
    <div className="space-y-4">
      {/* Formula label */}
      <div className="rounded-md bg-muted/40 px-3 py-2 border border-border/40">
        <p className="font-mono text-[11px] text-foreground/60 tracking-tight">
          score = volume_weighted_taint_fraction × 100
        </p>
      </div>

      {/* Factor rows */}
      <div className="space-y-3">
        {/* Taint factor */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-foreground/70 font-medium">
              Taint Propagation
            </span>
            <span className="text-foreground/50 font-mono">
              {taintPct.toFixed(2)}% arrived
            </span>
          </div>
          <Progress value={taintPct} className="h-1.5" />
          <p className="text-[11px] text-foreground/40">
            Percentage of original illicit funds that reached this VASP based on transaction volumes.
          </p>
        </div>

        {/* Value context */}
        <div className="space-y-1 mt-4 border-t border-border/20 pt-3">
          <div className="flex justify-between text-xs">
            <span className="text-foreground/70 font-medium">
              Maximum Traceable Value
            </span>
            <span className="text-foreground/50 font-mono">
              {formatUSD(breakdown.totalValueUSD)}
            </span>
          </div>
          <p className="text-[11px] text-foreground/40">
            The largest single-hop transfer observed on this path.
          </p>
        </div>

        {/* Recency context */}
        <div className="space-y-1 mt-2">
          <div className="flex justify-between text-xs">
            <span className="text-foreground/70 font-medium">Recency</span>
            <span className="text-foreground/50 font-mono">
              {daysLabel}
            </span>
          </div>
          <p className="text-[11px] text-foreground/40">
            Time elapsed since the most recent transaction on this path.
          </p>
        </div>
      </div>

      {/* Combined score */}
      <div className="space-y-1 pt-3 border-t border-border/40 mt-4">
        <div className="flex justify-between text-xs">
          <span className="text-foreground/70 font-medium">Final Taint Score</span>
          <span className="text-foreground/80 font-mono font-semibold">
            {breakdown.score.toFixed(2)}
          </span>
        </div>
        <Progress value={scorePct} className="h-2" />
        <p className="text-[11px] text-foreground/50 leading-relaxed">
          {breakdown.score.toFixed(2)} →{" "}
          {breakdown.score >= thresholds.high
            ? `above High threshold (${thresholds.high}) → `
            : breakdown.score >= thresholds.medium
              ? `between Medium (${thresholds.medium}) and High (${thresholds.high}) thresholds → `
              : `below Medium threshold (${thresholds.medium}) → `}
          <strong>{confidence}</strong> confidence
        </p>
      </div>
    </div>
  );
}
