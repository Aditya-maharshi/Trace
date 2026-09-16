/**
 * CaseBoard.tsx
 *
 * Trello-style Kanban board for compliance case management.
 * Implements:
 * - Drag-and-drop via @dnd-kit with client-side state machine validation
 * - Optimistic UI with syncing state + snap-back animation on failure
 * - Sonner toast notifications for transition errors (409/400)
 * - SLA degradation visuals on each card
 * - Column-level case counts
 *
 * The board uses the shared caseStateMachine module (single source of truth)
 * to pre-validate transitions client-side before making the API call.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import type { Case, CaseStatus } from '../../../../../packages/shared-types';
import { isValidTransition, transitionError } from '../../../../../packages/shared-types';
import { CaseCard } from './CaseCard';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { Plus, RefreshCw, Download } from 'lucide-react';

const COLUMNS: { id: CaseStatus; label: string; accent: string }[] = [
  { id: 'open', label: 'Open', accent: 'bg-blue-500' },
  { id: 'investigating', label: 'Investigating', accent: 'bg-amber-500' },
  { id: 'escalated', label: 'Escalated', accent: 'bg-red-500' },
  { id: 'closed', label: 'Closed', accent: 'bg-emerald-500' },
];

interface SyncingState {
  caseId: string;
  originalStatus: CaseStatus;
}

function DroppableColumn({
  columnId,
  label,
  accent,
  cases,
  syncingCases,
  children,
}: {
  columnId: CaseStatus;
  label: string;
  accent: string;
  cases: Case[];
  syncingCases: Set<string>;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col min-h-[500px] w-full min-w-[280px] max-w-[340px]
        rounded-2xl border transition-all duration-300
        ${isOver
          ? 'border-white/20 bg-white/[0.04] shadow-lg shadow-white/5'
          : 'border-white/[0.06] bg-white/[0.02]'}
      `}
    >
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/[0.06]">
        <div className={`w-2.5 h-2.5 rounded-full ${accent}`} />
        <h2 className="text-sm font-semibold text-white/80 tracking-wide">{label}</h2>
        <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/[0.06] text-[10px] font-bold text-white/40 tabular-nums">
          {cases.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2.5 flex-1 overflow-y-auto scrollbar-thin">
        <SortableContext items={cases.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>

        {cases.length === 0 && (
          <div className="flex-1 flex items-center justify-center min-h-[120px]">
            <p className="text-xs text-white/20 italic">No cases</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function CaseBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingCases, setSyncingCases] = useState<Map<string, SyncingState>>(new Map());
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // Group cases by status
  const casesByStatus = useMemo(() => {
    const grouped: Record<CaseStatus, Case[]> = { open: [], investigating: [], escalated: [], closed: [] };
    for (const c of cases) {
      grouped[c.status]?.push(c);
    }
    return grouped;
  }, [cases]);

  // Fetch cases
  const fetchCases = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const guestSession = localStorage.getItem('trace_guest_session');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      else if (guestSession) headers['Authorization'] = `Bearer ${guestSession}`;

      const res = await fetch(`${API_BASE}/api/v1/cases`, { headers });
      if (!res.ok) throw new Error('Failed to fetch cases');
      const data = await res.json();
      setCases(data);
    } catch (err) {
      console.error('[CaseBoard] Fetch error:', err);
      toast.error('Failed to load cases');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Transition API call
  const transitionCaseApi = useCallback(async (
    caseId: string,
    newStatus: CaseStatus,
    reason: string,
    clientVersion: number,
  ): Promise<{ success: boolean; error?: string; conflict?: boolean; invalid?: boolean; currentCase?: Case; updatedCase?: Case }> => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const guestSession = localStorage.getItem('trace_guest_session');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      else if (guestSession) headers['Authorization'] = `Bearer ${guestSession}`;

      const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ newStatus, reason, clientVersion }),
      });

      const data = await res.json();

      if (res.status === 409) {
        return { success: false, conflict: true, error: data.error, currentCase: data.currentCase };
      }
      if (res.status === 400) {
        return { success: false, invalid: true, error: data.error, currentCase: data.currentCase };
      }
      if (!res.ok) {
        return { success: false, error: data.error || 'Unknown error' };
      }

      return { success: true, updatedCase: data.updatedCase };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const dragged = cases.find(c => c.id === event.active.id);
    setActiveCase(dragged || null);
  }, [cases]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveCase(null);
    const { active, over } = event;
    if (!over) return;

    const caseId = active.id as string;
    const targetStatus = over.id as CaseStatus;
    const currentCase = cases.find(c => c.id === caseId);

    if (!currentCase || currentCase.status === targetStatus) return;

    // 1. Client-side state machine validation
    if (!isValidTransition(currentCase.status, targetStatus)) {
      const errMsg = transitionError(currentCase.status, targetStatus);
      toast.error(errMsg || 'Invalid transition', {
        description: `Cannot move from "${currentCase.status}" to "${targetStatus}"`,
      });
      return;
    }

    // 2. Optimistic update — snap card to new column
    setCases(prev => prev.map(c =>
      c.id === caseId ? { ...c, status: targetStatus } : c
    ));

    // 3. Mark as syncing
    setSyncingCases(prev => {
      const next = new Map(prev);
      next.set(caseId, { caseId, originalStatus: currentCase.status });
      return next;
    });

    // 4. API call
    const reason = `Manually moved from ${currentCase.status} to ${targetStatus}`;
    const result = await transitionCaseApi(caseId, targetStatus, reason, currentCase.version);

    // 5. Clear syncing state
    setSyncingCases(prev => {
      const next = new Map(prev);
      next.delete(caseId);
      return next;
    });

    if (result.success) {
      // Reconcile with server version
      if (result.updatedCase) {
        setCases(prev => prev.map(c =>
          c.id === caseId ? result.updatedCase! : c
        ));
      }
      toast.success('Case transitioned', {
        description: `${currentCase.title} → ${targetStatus}`,
      });
    } else {
      // Revert optimistic update with snap-back
      setCases(prev => prev.map(c =>
        c.id === caseId ? { ...c, status: currentCase.status } : c
      ));

      if (result.conflict) {
        toast.error('Transition failed: Version conflict', {
          description: result.error || 'Case was modified by another user.',
          action: {
            label: 'Refresh board',
            onClick: () => fetchCases(),
          },
        });
      } else if (result.invalid) {
        toast.error('Invalid transition', {
          description: result.error,
        });
      } else {
        // Network error — offer retry
        toast.error('Transition failed', {
          description: result.error || 'Network error occurred.',
          action: {
            label: 'Retry',
            onClick: () => handleDragEnd(event),
          },
        });
      }
    }
  }, [cases, transitionCaseApi, fetchCases]);

  const handleExportSar = useCallback(async (caseId: string) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/api/v1/cases/${caseId}/export`, {
        method: 'POST',
        headers,
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error('Export failed', { description: data.error });
        return;
      }

      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sar_case_${caseId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('SAR payload exported');
    } catch {
      toast.error('Export failed');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-orange-500/40 border-t-orange-400 animate-spin" />
          <p className="text-white/40 text-sm">Loading cases…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Board toolbar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-white/90">Case Management Board</h1>
          <span className="text-xs text-white/30 font-mono bg-white/5 px-2 py-0.5 rounded-full">
            {cases.length} total
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); fetchCases(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/5 border border-white/10 transition-all"
            disabled={refreshing}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <DroppableColumn
              key={col.id}
              columnId={col.id}
              label={col.label}
              accent={col.accent}
              cases={casesByStatus[col.id]}
              syncingCases={new Set(Array.from(syncingCases.keys()))}
            >
              <AnimatePresence>
                {casesByStatus[col.id].map(c => (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CaseCard
                      caseData={c}
                      isSyncing={syncingCases.has(c.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </DroppableColumn>
          ))}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeCase && (
            <div className="opacity-90 rotate-2 scale-105">
              <CaseCard caseData={activeCase} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
