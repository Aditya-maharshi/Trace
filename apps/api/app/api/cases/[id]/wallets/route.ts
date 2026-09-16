import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '../../../../../lib/domains/auth/verifyJwt';
import { addWalletToCase, removeWalletFromCase } from '../../../../../lib/domains/cases/caseStore';
import { runCaseAutomationScan } from '../../../../../lib/domains/cases/caseAutomation';
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
    // Ownership check: verify user has access to this case
    const { data: caseRow } = await client
      .from('cases')
      .select('user_id, analyst_id')
      .eq('id', params.id)
      .single();

    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    if (caseRow.user_id !== null && caseRow.user_id !== userId && caseRow.analyst_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: wallets, error } = await client
      .from('case_wallets')
      .select('*')
      .eq('case_id', params.id)
      .order('added_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(wallets, {
      status: 200,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error(`[GET /api/cases/${params.id}/wallets] Error:`, err);
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
    // Ownership check before mutation
    const ownerClient = getSupabaseAdmin();
    if (ownerClient) {
      const { data: caseRow } = await ownerClient
        .from('cases')
        .select('user_id, analyst_id')
        .eq('id', params.id)
        .single();
      if (!caseRow) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      if (caseRow.user_id !== null && caseRow.user_id !== userId && caseRow.analyst_id !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await req.json();
    const { address, notes } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address is required' }, { status: 400 });
    }

    const result = await addWalletToCase({
      caseId: params.id,
      address,
      addedBy: userId,
      notes,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Trigger an asynchronous background scan on the newly added wallet!
    // We don't await this so the API responds quickly to the user.
    runCaseAutomationScan(params.id).catch((err) => {
      console.error(`[caseAutomation] Background scan failed for case ${params.id}:`, err);
    });

    return NextResponse.json(result.wallet, {
      status: 201,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error(`[POST /api/cases/${params.id}/wallets] Error:`, err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = extractVerifiedUserId(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'address query parameter is required' }, { status: 400 });
  }

  // Ownership check before mutation
  const ownerClient = getSupabaseAdmin();
  if (ownerClient) {
    const { data: caseRow } = await ownerClient
      .from('cases')
      .select('user_id, analyst_id')
      .eq('id', params.id)
      .single();
    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    if (caseRow.user_id !== null && caseRow.user_id !== userId && caseRow.analyst_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const result = await removeWalletFromCase({
      caseId: params.id,
      address,
      removedBy: userId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true }, {
      status: 200,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error(`[DELETE /api/cases/${params.id}/wallets] Error:`, err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
