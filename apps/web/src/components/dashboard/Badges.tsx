import type { ConfidenceLevel, RiskLevel } from "@/lib/types";
import { ShieldCheck, ShieldAlert, ShieldX, Building2, Globe, ServerCrash, HelpCircle } from "lucide-react";
import type { VaspClassificationDetails } from "@/lib/api";

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
  const isUnknown = level === "UNKNOWN";

  const styles = isHigh
    ? { cls: "bg-red-500/15 text-red-400 border border-red-500/30 ring-1 ring-red-500/10", label: "High Risk", icon: "⚠" }
    : isUnknown
    ? { cls: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 ring-1 ring-yellow-500/10", label: "Unknown Risk", icon: "?" }
    : { cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ring-1 ring-emerald-500/10", label: "Low Risk", icon: "✓" };

  return (
    <span className={`${base} ${styles.cls}`}>
      <span>{styles.icon}</span>
      {styles.label}
    </span>
  );
}

export function ClassificationBadge({ details }: { details?: VaspClassificationDetails }) {
  if (!details) return null;

  const styles = {
    onshore_registered: {
      cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ring-1 ring-emerald-500/10",
      label: "FIU-IND Registered (Onshore)",
      icon: <Building2 className="h-3.5 w-3.5" />
    },
    offshore_registered: {
      cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30 ring-1 ring-blue-500/10",
      label: "FIU-IND Registered (Offshore)",
      icon: <Globe className="h-3.5 w-3.5" />
    },
    offshore_non_compliant: {
      cls: "bg-red-500/15 text-red-400 border border-red-500/30 ring-1 ring-red-500/10",
      label: "Offshore Non-Compliant",
      icon: <ServerCrash className="h-3.5 w-3.5" />
    },
    unknown: {
      cls: "bg-slate-500/15 text-slate-400 border border-slate-500/30 ring-1 ring-slate-500/10",
      label: "Unknown Registration",
      icon: <HelpCircle className="h-3.5 w-3.5" />
    }
  };

  const { cls, label, icon } = styles[details.classification] || styles.unknown;

  return (
    <span className={`${base} ${cls}`} title={`Source: ${details.sourceReference}\nLast Synced: ${new Date(details.lastSyncedAt).toLocaleDateString()}`}>
      {icon}
      {label}
    </span>
  );
}

export function DataSourceBadge({ dataProvenance }: { dataProvenance?: { source: string, fetchedAt: string } }) {
  const isLive = dataProvenance?.source === "live-etherscan" || dataProvenance?.source === "live-blockscout";
  const styles = isLive
    ? { cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30 ring-1 ring-blue-500/10", label: `Live Network (${dataProvenance?.source === 'live-etherscan' ? 'Etherscan' : 'Blockscout'})`, icon: "🟢" }
    : { cls: "bg-purple-500/15 text-purple-400 border border-purple-500/30 ring-1 ring-purple-500/10", label: "Cached Fixture", icon: "🟣" };
    
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
