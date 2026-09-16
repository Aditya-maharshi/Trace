export type CaseStatus = 'open' | 'investigating' | 'escalated' | 'closed';
export type SlaStatus = 'ok' | 'warning' | 'breached';

/**
 * Directed adjacency list representing valid state transitions.
 * This is the canonical single source of truth for the entire system (backend and frontend).
 */
export const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ['investigating', 'closed'],
  investigating: ['escalated', 'closed'],
  escalated: ['investigating', 'closed'], // De-escalation allowed with explicit reason
  closed: [], // Terminal state
};

/**
 * Default SLA duration in hours per case status.
 */
export const DEFAULT_SLA_THRESHOLDS_HOURS: Record<CaseStatus, number> = {
  open: 72,
  investigating: 48,
  escalated: 24,
  closed: 0,
};

/**
 * Checks whether transitioning from `from` to `to` is permitted.
 */
export function isValidTransition(from: CaseStatus, to: CaseStatus): boolean {
  if (from === to) return false;
  const allowed = TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Returns a human-friendly error message if the transition is invalid, or null if valid.
 */
export function transitionError(from: CaseStatus, to: CaseStatus): string | null {
  if (from === to) {
    return `Case is already in '${from}' status.`;
  }
  if (from === 'closed') {
    return `Closed cases are terminal and cannot be transitioned to '${to}'.`;
  }
  const allowed = TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    const validTargets = allowed && allowed.length > 0 ? allowed.join(', ') : 'none';
    return `Invalid state transition from '${from}' to '${to}'. Allowed next states: ${validTargets}.`;
  }
  return null;
}

/**
 * Returns all allowable target states for a given state.
 */
export function getAllowedTransitions(from: CaseStatus): CaseStatus[] {
  return TRANSITIONS[from] || [];
}

/**
 * Returns whether a state is terminal (no outgoing transitions).
 */
export function isTerminalStatus(status: CaseStatus): boolean {
  return !TRANSITIONS[status] || TRANSITIONS[status].length === 0;
}

/**
 * Validates transition reason text. Must be non-empty and non-whitespace.
 */
export function validateTransitionReason(reason?: string | null): { valid: boolean; error?: string } {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return { valid: false, error: 'A non-empty transition reason is required.' };
  }
  return { valid: true };
}

/**
 * Computes the SLA status given the timestamp when the state was entered and the threshold hours.
 */
export function computeSlaStatus(
  enteredAt: string | Date | number,
  thresholdHours: number,
  nowTime: number = Date.now()
): {
  status: SlaStatus;
  elapsedHours: number;
  percentage: number;
} {
  if (thresholdHours <= 0) {
    return { status: 'ok', elapsedHours: 0, percentage: 0 };
  }

  const enteredMs = typeof enteredAt === 'string' ? new Date(enteredAt).getTime() : new Date(enteredAt).getTime();
  const elapsedHours = Math.max(0, (nowTime - enteredMs) / (1000 * 60 * 60));
  const percentage = (elapsedHours / thresholdHours) * 100;

  if (elapsedHours >= thresholdHours) {
    return { status: 'breached', elapsedHours, percentage };
  }
  if (percentage >= 75) {
    return { status: 'warning', elapsedHours, percentage };
  }
  return { status: 'ok', elapsedHours, percentage };
}
