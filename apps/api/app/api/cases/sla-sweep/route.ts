/**
 * API Route: POST /api/cases/sla-sweep
 *
 * Scheduled job (every 15 minutes) that updates the denormalized sla_status
 * enum on all active cases, and fires notification triggers on breached SLAs.
 *
 * This complements the read-time SLA computation in listCases() —
 * the sweep ensures proactive notifications and dashboard aggregate counts
 * stay accurate without requiring individual API reads.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/domains/core/auditLog';
import { computeSlaStatus, DEFAULT_SLA_THRESHOLDS_HOURS, CaseStatus, SlaStatus } from '@sih/shared-types';
import { sendCaseNotification } from '../../../../lib/domains/cases/caseNotifications';

export async function POST(req: NextRequest) {
  // Protect with automation secret
  const automationSecret = process.env.AUTOMATION_SECRET;
  const authHeader = req.headers.get('authorization') || '';

  if (automationSecret && authHeader !== `Bearer ${automationSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: 'Database service unavailable' }, { status: 500 });
  }

  try {
    // 1. Fetch all non-closed cases
    const { data: activeCases, error: casesErr } = await client
      .from('cases')
      .select('id, org_id, status, sla_status, entered_current_state_at, title, analyst_id, risk_score')
      .neq('status', 'closed');

    if (casesErr) throw casesErr;
    if (!activeCases || activeCases.length === 0) {
      return NextResponse.json({ message: 'No active cases', updated: 0 }, { status: 200 });
    }

    // 2. Fetch all SLA policies
    const { data: slaPolicies } = await client.from('sla_policies').select('*');
    const policyMap = new Map<string, number>();
    if (slaPolicies) {
      for (const p of slaPolicies) {
        policyMap.set(`${p.org_id}:${p.state}`, p.threshold_hours);
      }
    }

    const nowTime = Date.now();
    let updatedCount = 0;
    let breachedCount = 0;

    // 3. Evaluate each case and update sla_status if changed
    for (const c of activeCases) {
      const threshold =
        policyMap.get(`${c.org_id}:${c.status}`) ??
        DEFAULT_SLA_THRESHOLDS_HOURS[c.status as CaseStatus] ??
        48;

      const sla = computeSlaStatus(c.entered_current_state_at, threshold, nowTime);

      if (sla.status !== c.sla_status) {
        const { error: updateErr } = await client
          .from('cases')
          .update({ sla_status: sla.status as SlaStatus, updated_at: new Date().toISOString() })
          .eq('id', c.id);

        if (!updateErr) {
          updatedCount++;
        }

        // 4. Fire notification on breach
        if (sla.status === 'breached' && c.sla_status !== 'breached') {
          breachedCount++;

          const isHighRisk = c.risk_score !== null && c.risk_score >= 70;

          sendCaseNotification({
            event: 'sla_breached',
            caseId: c.id,
            title: c.title || 'Untitled case',
            details: `SLA breached: ${Math.round(sla.elapsedHours)}h in "${c.status}" state (threshold: ${threshold}h).${isHighRisk ? ' HIGH RISK — escalating to compliance lead.' : ''}`,
            metadata: {
              status: c.status,
              elapsed_hours: Math.round(sla.elapsedHours),
              threshold_hours: threshold,
              risk_score: c.risk_score,
              analyst_id: c.analyst_id,
            },
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    }

    return NextResponse.json(
      { message: `SLA sweep complete`, total: activeCases.length, updated: updatedCount, breached: breachedCount },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('[POST /api/cases/sla-sweep] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
