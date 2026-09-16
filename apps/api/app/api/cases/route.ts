import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '../../../lib/domains/auth/verifyJwt';
import { listCases, createCase } from '../../../lib/domains/cases/caseStore';
import { withApiVersionHeaders } from '../../../lib/domains/core/apiVersion';
import { CaseStatus } from '@sih/shared-types';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = extractVerifiedUserId(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') as CaseStatus | null;
  const orgId = searchParams.get('orgId') || undefined;

  try {
    const cases = await listCases({
      userId,
      orgId,
      status: status || undefined,
    });
    
    return NextResponse.json(cases, {
      status: 200,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error('[GET /api/cases] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = extractVerifiedUserId(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, description, wallets, jurisdiction, riskScore, orgId } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'Missing required field: title' }, { status: 400 });
    }

    const newCase = await createCase({
      userId,
      title,
      description,
      wallets: Array.isArray(wallets) ? wallets : [],
      jurisdiction,
      riskScore,
      orgId,
    });

    return NextResponse.json(newCase, {
      status: 201,
      headers: withApiVersionHeaders({}),
    });
  } catch (err: any) {
    console.error('[POST /api/cases] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
