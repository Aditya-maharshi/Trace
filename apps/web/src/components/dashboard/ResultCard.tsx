import { useState, useMemo } from "react";
import { motion } from "motion/react";
import type { AttributionResponse } from "@/lib/api";
import { exportReport, API_BASE } from "@/lib/api";
import type { PathHop, PathResult } from "@/lib/types";
import { ConfidenceBadge, RiskBadge, DataSourceBadge, ClassificationBadge } from "./Badges";
import { AttributionGraph } from "./AttributionGraph";
import { PathBreakdown } from "./PathBreakdown";
import { ExplainabilityPanel } from "./ExplainabilityPanel";
import { TopVaspRanking } from "./TopVaspRanking";
import { FollowUpChat } from "./FollowUpChat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowUpRight,
  ShieldAlert,
  FlaskConical,
  Trophy,
  GitBranch,
  Building2,
  Hash,
} from "lucide-react";

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-xl p-6 ${className}`}>
      {children}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] uppercase tracking-[0.15em] text-white/30 font-semibold">
      {children}
    </p>
  );
}

// ── Stat item ─────────────────────────────────────────────────────────────────
function StatItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div className="h-7 w-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-white/40" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-white truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ResultCard({
  data,
  narrative,
}: {
  data: AttributionResponse;
  narrative: string | null;
}) {
  const [highlightedHop, setHighlightedHop] = useState<{ pathIndex: number; hopIndex: number } | null>(null);

  const exitedToBridge = Boolean(
    data.traceExitedToBridge && data.bridgeExitPoints && data.bridgeExitPoints.length > 0,
  );
  const primaryBridge = exitedToBridge ? data.bridgeExitPoints![0] : null;
  const bridgeLabel = primaryBridge?.label || "Cross-chain Bridge";

  const vaspName =
    data.nearestVaspLabel ||
    data.nearestVasp ||
    (exitedToBridge ? `Exited → ${bridgeLabel}` : "Unknown VASP");
  const hopsCount = data.hops ?? (exitedToBridge && primaryBridge ? primaryBridge.hopIndex : 0);

  const hasSanctions = data.sanctionsDetail && data.sanctionsDetail.some((s: any) => s.sanctioned);
  const sanctionsUnavailable = Boolean(data.sanctionsCheckUnavailable);
  const hasIncomplete = Boolean(
    data.incompleteTraversal &&
      (data.incompleteTraversal.skippedNodes > 0 ||
        data.incompleteTraversal.timeoutReached ||
        data.incompleteTraversal.historyTruncated),
  );
  const hasMixerExposure = data.mixerExposure && data.mixerExposure.length > 0;

  const winningBreakdown = data.paths?.[0]?.breakdown;
  const thresholds = data.confidenceThresholds ?? { high: 8, medium: 3 };
  const topVasps = data.topVasps ?? [];
  const ensNames = data.ensNames ?? {};

  const pathResults: PathResult[] = useMemo(() => {
    if (!data.paths || data.paths.length === 0) return [];
    return data.paths.map((scored: any) => {
      const hops: PathHop[] = (scored.path || []).map((addr: string, idx: number) => {
        const isFirst = idx === 0;
        const isLast = idx === scored.path.length - 1;
        const bridgeMatch = data.bridgeExitPoints?.find(
          (b: any) => b.address.toLowerCase() === addr.toLowerCase(),
        );
        let label: string | undefined;
        if (bridgeMatch) label = bridgeMatch.label;
        else if (isFirst) label = "Target wallet";
        else if (isLast) label = vaspName;
        else label = `Hop ${idx}`;

        const resolvedEns = ensNames[addr.toLowerCase()];
        return {
          address: addr,
          valueEth: 0,
          timestamp: new Date().toISOString(),
          label,
          ...(resolvedEns ? { ensName: resolvedEns } : {}),
        };
      });
      return { hops, score: scored.score };
    });
  }, [data.paths, data.bridgeExitPoints, vaspName, ensNames]);

  return (
    <div className="space-y-4">
      {/* ── Row 1: Graph (full width) ── */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-400/80 font-semibold mb-0.5">
              Interactive Trace Graph
            </p>
            <h2 className="text-base font-semibold text-white">
              {vaspName}
            </h2>
          </div>
          <div className="flex gap-2">
            {data.dataProvenance && <DataSourceBadge dataProvenance={data.dataProvenance} />}
            <ClassificationBadge details={data.vaspClassification} />
            <ConfidenceBadge level={data.confidence || "Low"} />
            <RiskBadge level={data.risk} structuringFlag={data.structuringSignalDetected} />
            <div className="flex gap-2 ml-2">
              <button
                onClick={() => {
                  exportReport(data, "pdf").catch(err => alert(err.message));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors border border-white/10"
              >
                <Download className="h-3.5 w-3.5" />
                PDF
              </button>
              <button
                onClick={() => {
                  exportReport(data, "csv").catch(err => alert(err.message));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors border border-white/10"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                onClick={() => {
                  exportReport(data, "ivms101").catch(err => alert(err.message));
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors border border-purple-500/20"
              >
                <Download className="h-3.5 w-3.5" />
                IVMS101
              </button>

            </div>
          </div>
        </div>
          <AttributionGraph
            graph={data.graph}
            target={data.wallet}
          />
      </motion.div>

      {/* ── Row 2: Stats + AI Narrative ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <SectionLabel>Attribution summary</SectionLabel>
            <StatItem icon={Building2} label="Destination VASP" value={vaspName} />
            <StatItem icon={Hash} label="Hops to VASP" value={`${hopsCount} hop${hopsCount !== 1 ? "s" : ""}`} />
            <StatItem icon={GitBranch} label="Paths traced" value={data.paths?.length ?? 0} />

            {/* Alerts */}
            {exitedToBridge && (
              <Alert className="mt-4 border-amber-500/20 bg-amber-500/8 text-amber-400">
                <ArrowUpRight className="h-4 w-4" />
                <AlertTitle className="text-amber-400 font-semibold text-sm">Cross-Chain Exit Detected</AlertTitle>
                <AlertDescription className="text-amber-400/70 text-xs mt-1">
                  Trail exits via <strong>{bridgeLabel}</strong> — cannot trace further.
                </AlertDescription>
              </Alert>
            )}
            

            {hasIncomplete && (
              <Alert className="mt-3 border-yellow-500/20 bg-yellow-500/8 text-yellow-400">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-yellow-400 font-semibold text-sm">
                  {data.incompleteTraversal?.timeoutReached
                    ? "Partial Results (Timeout)"
                    : data.incompleteTraversal?.historyTruncated
                      ? "Partial Wallet History"
                      : "Incomplete Traversal"}
                </AlertTitle>
                <AlertDescription className="text-yellow-400/70 text-xs mt-1">
                  {data.incompleteTraversal?.timeoutReached
                    ? "The search was aborted due to the maximum execution time budget. Showing the best paths found so far."
                    : data.incompleteTraversal?.historyTruncated
                      ? `This trace inspected only the newest 100 transactions per address. ${
                          (data.incompleteTraversal.historyTruncatedAddresses?.length ?? 0) > 0
                            ? `${data.incompleteTraversal.historyTruncatedAddresses!.length} wallet(s) have additional history that was not scored.`
                            : "High-volume wallets may have additional history that was not scored."
                        }`
                    : `${data.incompleteTraversal!.skippedNodes} node${data.incompleteTraversal!.skippedNodes !== 1 ? "s" : ""} skipped due to provider failures.`}
                </AlertDescription>
              </Alert>
            )}
            {sanctionsUnavailable && (
              <Alert className="mt-3 border-yellow-500/20 bg-yellow-500/8 text-yellow-400">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-yellow-400 font-semibold text-sm">Sanctions Check Unavailable</AlertTitle>
                <AlertDescription className="text-yellow-400/70 text-xs mt-1">
                  The OpenSanctions screening service was unreachable during this trace.
                  Risk level is marked as &quot;Unknown&quot; — this result has <strong>not</strong> been
                  screened against OFAC/SDN lists. Please retry or verify manually before making
                  compliance decisions.
                </AlertDescription>
              </Alert>
            )}
            {hasSanctions && (
              <Alert className="mt-3 border-red-500/20 bg-red-500/8 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-red-400 font-semibold text-sm">Sanctions Match</AlertTitle>
                <AlertDescription className="text-red-400/70 text-xs mt-1">
                  <ul className="list-none space-y-0.5 mt-1">
                    {data.sanctionsDetail?.filter((s: any) => s.sanctioned).map((s: any, idx: number) => (
                      <li key={idx} className="font-mono">{ensNames[s.address.toLowerCase()] ?? s.address}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {hasMixerExposure && (
              <Alert className="mt-3 border-red-500/20 bg-red-500/8 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-red-400 font-semibold text-sm">Mixer / Tornado Cash Exposure</AlertTitle>
                <AlertDescription className="text-red-400/70 text-xs mt-1">
                  Funds passed through a sanctioned mixing protocol.
                </AlertDescription>
              </Alert>
            )}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <Card className="flex flex-col gap-0">
            <SectionLabel>AI Narrative</SectionLabel>
            {narrative === null ? (
              <div className="space-y-2.5">
                <Skeleton className="h-3 w-full bg-white/5" />
                <Skeleton className="h-3 w-[90%] bg-white/5" />
                <Skeleton className="h-3 w-[80%] bg-white/5" />
                <Skeleton className="h-3 w-[75%] bg-white/5" />
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-white/60">{narrative}</p>
            )}
          </Card>
        </motion.div>
      </div>

      {/* ── Row 3: Path Breakdown + Score Analysis ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card>
            <SectionLabel>Path breakdown</SectionLabel>
            <PathBreakdown paths={pathResults} />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <Card>
            {winningBreakdown && (
              <>
                <SectionLabel>Score analysis</SectionLabel>
                <Accordion type="single" collapsible defaultValue="explainability">
                  <AccordionItem value="explainability" className="border-none">
                    <AccordionTrigger className="text-sm text-white/60 hover:text-white gap-2 py-0 pb-3">
                      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      Why this confidence score?
                    </AccordionTrigger>
                    <AccordionContent>
                      <ExplainabilityPanel
                        breakdown={winningBreakdown}
                        confidence={data.confidence ?? "Low"}
                        thresholds={thresholds}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            )}
            {topVasps.length > 1 && (
              <>
                <SectionLabel>Alternative VASP candidates</SectionLabel>
                <Accordion type="single" collapsible>
                  <AccordionItem value="top-vasps" className="border-none">
                    <AccordionTrigger className="text-sm text-white/60 hover:text-white gap-2 py-0 pb-3">
                      <Trophy className="h-3.5 w-3.5 shrink-0 text-white/40" />
                      See all candidates
                    </AccordionTrigger>
                    <AccordionContent>
                      <TopVaspRanking candidates={topVasps} />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            )}
            {!winningBreakdown && topVasps.length <= 1 && (
              <p className="text-sm text-white/30">No additional score data available.</p>
            )}
          </Card>
        </motion.div>
      </div>

      {/* ── Row 4: Compliance Disclaimer ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 flex gap-3"
      >
        <ShieldAlert className="h-4 w-4 text-white/30 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
            Investigative Lead Notice & Compliance Disclaimer
          </p>
          <p className="text-xs text-white/30 leading-relaxed">
            This result is an <strong className="text-white/50">investigative lead</strong> generated by automated
            heuristics, <strong className="text-white/50">not a formal legal determination</strong>. A LOW risk
            assessment does not certify a wallet is clean. Human analyst review is required before any compliance action.
          </p>
        </div>
      </motion.div>

      {/* ── Row 5: Follow-up Chat ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
      >
        <FollowUpChat
          data={data}
          onCiteClick={(pathIndex, hopIndex) => {
            setHighlightedHop({ pathIndex, hopIndex });
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </motion.div>
    </div>
  );
}
