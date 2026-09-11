/**
 * TopVaspRanking.tsx (S4)
 *
 * Renders a ranked list of the top-3 VASP candidates for an attribution.
 * #1 is the primary answer; #2 and #3 are supporting evidence that
 * "we're not overconfident" — visually de-emphasized accordingly.
 */
import { ConfidenceBadge, RiskBadge } from "./Badges";
import type { TopVaspEntry } from "@/lib/api";

interface TopVaspRankingProps {
  candidates: TopVaspEntry[];
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const RANK_LABELS = ["#1", "#2", "#3"] as const;

export function TopVaspRanking({ candidates }: TopVaspRankingProps) {
  if (!candidates || candidates.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-foreground/40">
        Top VASP candidates
      </p>
      <div className="space-y-2">
        {candidates.map((c, idx) => {
          const isPrimary = idx === 0;
          const label = c.vaspLabel ?? truncateAddress(c.vasp);
          return (
            <div
              key={c.vasp}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                isPrimary
                  ? "border-border bg-muted/30"
                  : "border-border/40 bg-background/50 opacity-60 hover:opacity-80"
              }`}
            >
              {/* Rank number */}
              <span
                className={`shrink-0 font-mono font-bold ${
                  isPrimary
                    ? "text-foreground/80 text-sm"
                    : "text-foreground/40 text-xs"
                }`}
              >
                {RANK_LABELS[idx] ?? `#${idx + 1}`}
              </span>

              {/* VASP info */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <p
                  className={`font-medium truncate ${
                    isPrimary ? "text-sm text-foreground" : "text-xs text-foreground/70"
                  }`}
                >
                  {label}
                </p>
                <p className="text-[11px] text-foreground/40 font-mono">
                  {truncateAddress(c.vasp)}
                </p>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <ConfidenceBadge level={c.confidence} />
                  {c.risk === "HIGH" && (
                    <RiskBadge level={c.risk} />
                  )}
                  <span className="text-[11px] text-foreground/40">
                    {c.bestHops} hop{c.bestHops !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[11px] text-foreground/30">
                    · score {c.combinedScore.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
