import { NextRequest, NextResponse } from 'next/server';
import { runCaseAutomationScan } from '../../../../lib/domains/cases/caseAutomation';
import { getSupabaseAdmin } from '../../../../lib/domains/core/auditLog';

export async function POST(req: NextRequest) {
  // Check for service role or automation secret to prevent unauthenticated abuse
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
    // Select cases that are 'open' or 'investigating' (we don't need to scan closed or already escalated ones)
    const { data: activeCases, error } = await client
      .from('cases')
      .select('id')
      .in('status', ['open', 'investigating']);

    if (error) throw error;

    if (!activeCases || activeCases.length === 0) {
      return NextResponse.json({ message: 'No active cases to scan' }, { status: 200 });
    }

    // Trigger scans in the background (fire and forget)
    // For large deployments this should be queued via a real task queue (like Quirrel or SQl)
    for (const c of activeCases) {
      runCaseAutomationScan(c.id).catch((err: any) => {
        console.error(`[caseAutomation] Scan failed for case ${c.id}:`, err);
      });
    }

    return NextResponse.json(
      { message: `Triggered scans for ${activeCases.length} cases` },
      { status: 202 }
    );
  } catch (err: any) {
    console.error(`[POST /api/cases/scan] Error:`, err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
