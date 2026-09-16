/**
 * CaseCard.tsx
 *
 * Individual case card for the Kanban board. Renders:
 * - Case title, risk score, wallet count
 * - SLA degradation visuals (amber warning, pulsing red breach)
 * - "Syncing" state (reduced opacity) during optimistic transitions
 * - Elapsed time badge in human-readable form
 *
 * Respects prefers-reduced-motion for the breach pulse animation.
 */

import { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Case } from '../../../../../packages/shared-types';
import { Clock, AlertTriangle, Shield, Wallet, ChevronRight } from 'lucide-react';

interface CaseCardProps {
  caseData: Case;
  isSyncing?: boolean;
  isSnapBack?: boolean;
  onClick?: () => void;
}

function formatElapsedTime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m in state`;
  if (hours < 24) return `${Math.round(hours)}h in state`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return `${days}d ${remainingHours}h in state`;
}

function getRiskBadge(score: number | null) {
  if (score === null || score === undefined) {
    return { label: 'Unknown', color: 'bg-white/10 text-white/50', dot: 'bg-white/30' };
  }
  if (score >= 70) {
    return { label: 'Critical', color: 'bg-red-500/15 text-red-400', dot: 'bg-red-400' };
  }
  if (score >= 40) {
    return { label: 'High', color: 'bg-amber-500/15 text-amber-400', dot: 'bg-amber-400' };
  }
  return { label: 'Low', color: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' };
}

export function CaseCard({ caseData, isSyncing, isSnapBack, onClick }: CaseCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: caseData.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isSnapBack ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : transition,
  };

  const slaStatus = caseData.sla_status || 'ok';
  const elapsedHours = caseData.time_in_state_hours ?? 0;
  const risk = getRiskBadge(caseData.risk_score);

  const borderClass = useMemo(() => {
    if (slaStatus === 'breached') return 'case-card--breached';
    if (slaStatus === 'warning') return 'case-card--warning';
    return '';
  }, [slaStatus]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        case-card group relative rounded-xl p-3.5 cursor-grab active:cursor-grabbing
        bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15]
        hover:bg-white/[0.06] transition-all duration-200
        ${borderClass}
        ${isDragging ? 'opacity-50 scale-[1.02] shadow-2xl z-50 rotate-1' : ''}
        ${isSyncing ? 'opacity-60' : ''}
      `}
    >
      {/* Syncing indicator */}
      {isSyncing && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[10px] text-blue-400 font-medium">Syncing</span>
        </div>
      )}

      {/* Top row: Risk badge + Wallet count */}
      <div className="flex items-center justify-between mb-2">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${risk.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
          {risk.label}
        </div>
        {caseData.wallets && caseData.wallets.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-white/40">
            <Wallet className="h-3 w-3" />
            {caseData.wallets.length}
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-white/90 leading-snug mb-1.5 line-clamp-2 group-hover:text-white transition-colors">
        {caseData.title}
      </h3>

      {/* Description preview */}
      {caseData.description && (
        <p className="text-[11px] text-white/40 leading-relaxed line-clamp-2 mb-2">
          {caseData.description}
        </p>
      )}

      {/* Bottom row: SLA + elapsed time */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/[0.05]">
        <div className={`flex items-center gap-1.5 text-[11px] font-mono ${
          slaStatus === 'breached' ? 'text-red-400' :
          slaStatus === 'warning' ? 'text-amber-400' :
          'text-white/40'
        }`}>
          {slaStatus === 'breached' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {formatElapsedTime(elapsedHours)}
        </div>

        <ChevronRight className="h-3 w-3 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
    </div>
  );
}
