import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '../../../../../lib/domains/auth/verifyJwt';
import { pinEvidence } from '../../../../../lib/domains/cases/caseStore';
import { withApiVersionHeaders } from '../../../../../lib/domains/core/apiVersion';
import { getSupabaseAdmin } from '../../../../../lib/domains/core/auditLog';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = extractVerifiedUserId(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: 'Database service unavailable' }, { status: 500 });
  }

  try {
    const { data: evidence, error } = await client
      .from('case_evidence')
      .select('*')
      .eq('case_id', params.id)
      .order('pinned_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(evidence, {
      status: 200,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error(`[GET /api/cases/${params.id}/evidence] Error:`, err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = extractVerifiedUserId(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { evidenceType, lookupId, subgraphSlice, annotation } = body;

    if (!evidenceType) {
      return NextResponse.json({ error: 'evidenceType is required' }, { status: 400 });
    }

    const validTypes = ['graph_node', 'graph_edge', 'subgraph_slice', 'lookup_snapshot', 'note'];
    if (!validTypes.includes(evidenceType)) {
      return NextResponse.json(
        { error: `Invalid evidenceType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await pinEvidence({
      caseId: params.id,
      evidenceType,
      lookupId: lookupId || null,
      subgraphSlice: subgraphSlice || null,
      pinnedBy: userId,
      annotation: annotation || null,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.evidence, {
      status: 201,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error(`[POST /api/cases/${params.id}/evidence] Error:`, err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
