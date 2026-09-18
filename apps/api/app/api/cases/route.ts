import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserIdAsync } from '../../../lib/domains/auth/verifyJwt';
import { listCases, createCase } from '../../../lib/domains/cases/caseStore';
import { withApiVersionHeaders } from '../../../lib/domains/core/apiVersion';
import { CaseStatus } from '@sih/shared-types';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const userId = await extractVerifiedUserIdAsync(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') as CaseStatus | null;
  // Securely resolve orgId from middleware (API Key context) or fallback to user's profile
  let secureOrgId = req.headers.get('x-tenant-org-id') || undefined;

  try {
    const cases = await listCases({
      userId,
      orgId: secureOrgId,
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
  const userId = await extractVerifiedUserIdAsync(authHeader);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, description, wallets, jurisdiction, riskScore } = body;

    if (!title || typeof title !== 'string' || title.length > 200) {
      return NextResponse.json({ error: 'Missing or excessively long field: title (max 200 chars)' }, { status: 400 });
    }
    
    if (description && (typeof description !== 'string' || description.length > 5000)) {
      return NextResponse.json({ error: 'Description exceeds maximum length of 5000 chars' }, { status: 400 });
    }

    if (jurisdiction && (typeof jurisdiction !== 'string' || jurisdiction.length > 100)) {
      return NextResponse.json({ error: 'Jurisdiction exceeds maximum length of 100 chars' }, { status: 400 });
    }

    // Securely resolve orgId
    let secureOrgId = req.headers.get('x-tenant-org-id') || undefined;

    const newCase = await createCase({
      userId,
      title,
      description,
      wallets: Array.isArray(wallets) ? wallets : [],
      jurisdiction,
      riskScore,
      orgId: secureOrgId,
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
