import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserIdAsync } from '../../../../lib/domains/auth/verifyJwt';
import { getCaseDetails, transitionCase } from '../../../../lib/domains/cases/caseStore';
import { withApiVersionHeaders } from '../../../../lib/domains/core/apiVersion';
import { CaseStatus } from '@sih/shared-types';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = await extractVerifiedUserIdAsync(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const details = await getCaseDetails(params.id);
    if (!details) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    
    // Authorization check: ensure the user has access to this case
    if (details.case.user_id !== null && details.case.user_id !== userId && details.case.analyst_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(details, {
      status: 200,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error(`[GET /api/cases/${params.id}] Error:`, err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = await extractVerifiedUserIdAsync(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const details = await getCaseDetails(params.id);
    if (!details) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    
    // Authorization check: ensure the user has access to transition this case
    if (details.case.user_id !== null && details.case.user_id !== userId && details.case.analyst_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { newStatus, reason, clientVersion, metadata } = body;

    if (!newStatus) {
      return NextResponse.json({ error: 'newStatus is required' }, { status: 400 });
    }

    if (!reason || reason.trim() === '') {
      return NextResponse.json({ error: 'Transition reason is required' }, { status: 400 });
    }

    const result = await transitionCase({
      caseId: params.id,
      newStatus: newStatus as CaseStatus,
      reason,
      actorId: userId,
      actorType: 'human',
      metadata,
      clientVersion,
    });

    if (result.notFound) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (result.invalid) {
      return NextResponse.json({ error: result.error, currentCase: result.currentCase }, { status: 400 });
    }

    if (result.conflict) {
      return NextResponse.json({ error: result.error, currentCase: result.currentCase }, { status: 409 });
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to transition case' }, { status: 500 });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error(`[PATCH /api/cases/${params.id}] Error:`, err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
