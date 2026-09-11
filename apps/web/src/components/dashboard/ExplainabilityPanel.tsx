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
  const hopFactorPct = toPercent(breakdown.hopFactor, 1); // max = 1 (1 hop)
  const valueFactorPct = toPercent(breakdown.valueFactor, 15); // log scale, 15 ≈ $3.3B
  const recencyFactorPct = toPercent(breakdown.recencyFactor, 1);
  const scorePct = toPercent(breakdown.score, thresholds.high * 1.5); // relative to High threshold

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
          score = (1/hops) × ln(1 + valueUSD) × recencyFactor
        </p>
      </div>

      {/* Factor rows */}
      <div className="space-y-3">
        {/* Hop factor */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-foreground/70 font-medium">
              Hop distance
            </span>
            <span className="text-foreground/50 font-mono">
              {breakdown.hops} hop{breakdown.hops !== 1 ? "s" : ""} → factor{" "}
              {breakdown.hopFactor.toFixed(3)}
            </span>
          </div>
          <Progress value={hopFactorPct} className="h-1.5" />
          <p className="text-[11px] text-foreground/40">
            Closer = stronger evidence. Direct link (1 hop) = factor 1.0
          </p>
        </div>

        {/* Value factor */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-foreground/70 font-medium">
              Transaction value
            </span>
            <span className="text-foreground/50 font-mono">
              {formatUSD(breakdown.totalValueUSD)} → factor{" "}
              {breakdown.valueFactor.toFixed(3)}
            </span>
          </div>
          <Progress value={valueFactorPct} className="h-1.5" />
          <p className="text-[11px] text-foreground/40">
            Log-scaled: ln(1 + {formatUSD(breakdown.totalValueUSD)}). Diminishing returns on very large amounts.
          </p>
        </div>

        {/* Recency factor */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-foreground/70 font-medium">Recency</span>
            <span className="text-foreground/50 font-mono">
              {daysLabel} → factor {breakdown.recencyFactor.toFixed(3)}
            </span>
          </div>
          <Progress value={recencyFactorPct} className="h-1.5" />
          <p className="text-[11px] text-foreground/40">
            exp(−0.01 × days). Recent activity weighted higher — 1.0 today, ~0.37 after 100 days.
          </p>
        </div>
      </div>

      {/* Combined score */}
      <div className="space-y-1 pt-1 border-t border-border/40">
        <div className="flex justify-between text-xs">
          <span className="text-foreground/70 font-medium">Combined score</span>
          <span className="text-foreground/80 font-mono font-semibold">
            {breakdown.score.toFixed(3)}
          </span>
        </div>
        <Progress value={scorePct} className="h-2" />
        <p className="text-[11px] text-foreground/50 leading-relaxed">
          {breakdown.score.toFixed(3)} →{" "}
          {breakdown.score > thresholds.high
            ? `above High threshold (${thresholds.high}) → `
            : breakdown.score > thresholds.medium
              ? `between Medium (${thresholds.medium}) and High (${thresholds.high}) thresholds → `
              : `below Medium threshold (${thresholds.medium}) → `}
          <strong>{confidence}</strong> confidence
        </p>
      </div>
    </div>
  );
}
