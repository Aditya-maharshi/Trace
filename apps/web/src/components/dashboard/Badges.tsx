import type { ConfidenceLevel, RiskLevel } from "@/lib/types";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

const base = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide";

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const styles = {
    High: { 
      cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 ring-1 ring-emerald-500/10",
      icon: <ShieldCheck className="h-3.5 w-3.5" />
    },
    Medium: { 
      cls: "bg-amber-500/15 text-amber-400 border border-amber-500/25 ring-1 ring-amber-500/10",
      icon: <ShieldAlert className="h-3.5 w-3.5" />
    },
    Low: { 
      cls: "bg-slate-500/15 text-slate-400 border border-slate-500/25 ring-1 ring-slate-500/10",
      icon: <ShieldX className="h-3.5 w-3.5" />
    },
  };
  const { cls, icon } = styles[level] ?? styles.Low;
  return (
    <span className={`${base} ${cls}`}>
      {icon}
      {level} Confidence
    </span>
  );
}

export function RiskBadge({
  level,
  structuringFlag,
}: {
  level: RiskLevel;
  structuringFlag?: boolean | undefined;
}) {
  const isHigh = level === "HIGH" || structuringFlag;

  const styles = isHigh
    ? { cls: "bg-red-500/15 text-red-400 border border-red-500/30 ring-1 ring-red-500/10", label: "High Risk", icon: "⚠" }
    : { cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ring-1 ring-emerald-500/10", label: "Low Risk", icon: "✓" };

  return (
    <span className={`${base} ${styles.cls}`}>
      <span>{styles.icon}</span>
      {styles.label}
    </span>
  );
}

export function DataSourceBadge({ dataProvenance }: { dataProvenance?: { source: string, fetchedAt: string } }) {
  const isLive = dataProvenance?.source === "live-etherscan" || dataProvenance?.source === "live-blockscout";
  const styles = isLive
    ? { cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30 ring-1 ring-blue-500/10", label: `Live Network (${dataProvenance?.source === 'live-etherscan' ? 'Etherscan' : 'Blockscout'})`, icon: "?" }
    : { cls: "bg-purple-500/15 text-purple-400 border border-purple-500/30 ring-1 ring-purple-500/10", label: "Cached Fixture", icon: "??" };
    
  const dateStr = dataProvenance?.fetchedAt ? new Date(dataProvenance.fetchedAt).toLocaleString() : "Unknown";

  return (
    <span className={`${base} ${styles.cls} flex flex-col items-start px-3 py-2 leading-tight gap-1`} title={`Fetched at: ${dateStr}`}>
      <span className="flex items-center gap-1.5">
        <span>{styles.icon}</span>
        {styles.label}
      </span>
      {dataProvenance?.fetchedAt && (
        <span className="text-[10px] text-white/50 lowercase tracking-normal">
          {new Date(dataProvenance.fetchedAt).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })}
        </span>
      )}
    </span>
  );
}
