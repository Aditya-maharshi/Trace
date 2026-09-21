const fs = require('fs');
const path = require('path');

const b0bFiles = [
  "apps/api/app/api/cases/[id]/route.ts",
  "apps/api/app/api/cases/[id]/wallets/route.ts",
  "apps/api/app/api/cases/[id]/export/route.ts"
];

for (const file of b0bFiles) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');
  if (!code.includes('assertCaseAccess')) {
     code = code.replace(/import \{.*?\} from '.*?caseStore';/, (match) => match.replace('}', ', assertCaseAccess }'));
  }
  code = code.replace(/if\s*\(\s*row\.user_id !== null\s*&&\s*row\.user_id !== userId\s*&&\s*row\.analyst_id !== userId\s*\)/g, 'if (!assertCaseAccess(row, userId, secureOrgId))');
  code = code.replace(/if\s*\(\s*existingWallet\.cases\.user_id !== null\s*&&\s*existingWallet\.cases\.user_id !== userId\s*&&\s*existingWallet\.cases\.analyst_id !== userId\s*\)/g, 'if (!assertCaseAccess(existingWallet.cases, userId, secureOrgId))');
  code = code.replace(/if\s*\(\s*caseRow\.user_id !== null\s*&&\s*caseRow\.user_id !== userId\s*&&\s*caseRow\.analyst_id !== userId\s*\)/g, 'if (!assertCaseAccess(caseRow, userId, secureOrgId))');
  
  // B6: Add Zod validation
  if (file.includes('cases/[id]/route.ts')) {
     code = code.replace(/const \{ newStatus, reason, clientVersion, metadata \} = await req\.json\(\);/,
       `const body = await req.json();
    const { newStatus, reason, clientVersion, metadata } = body;
    const allowedStatuses = ['open', 'investigating', 'escalated', 'closed'];
    if (newStatus && !allowedStatuses.includes(newStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    // ensure metadata doesn't contain privileged keys
    if (metadata && (metadata.role || metadata.user_id || metadata.org_id || metadata.analyst_id)) {
        return NextResponse.json({ error: 'Privileged keys in metadata not allowed' }, { status: 400 });
    }`);
  }
  fs.writeFileSync(p, code, 'utf8');
}

// B0: Evidence route IDOR fix
const evidenceRoute = path.join(__dirname, 'apps/api/app/api/cases/[id]/evidence/route.ts');
if (fs.existsSync(evidenceRoute)) {
  let evCode = fs.readFileSync(evidenceRoute, 'utf8');
  if (!evCode.includes('assertCaseAccess')) {
      evCode = evCode.replace(/import \{.*?\} from '.*?caseStore';/, "import { assertCaseAccess } from '../../../lib/domains/cases/caseStore';\n$&");
  }
  
  // Insert check before getSupabaseAdmin
  const checkCode = `
  let secureOrgId = req.headers.get('x-tenant-org-id') || undefined;
  const { data: caseRow, error: caseErr } = await getSupabaseAdmin().from('cases').select('*').eq('id', id).single();
  if (caseErr || !caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  if (!assertCaseAccess(caseRow, userId, secureOrgId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  `;
  evCode = evCode.replace(/(const \{ data, error \} = await getSupabaseAdmin\(\))/g, checkCode + '\n  $1');
  fs.writeFileSync(evidenceRoute, evCode, 'utf8');
}

// B2: Boot assertion
const instPath = path.join(__dirname, 'apps/api/instrumentation.ts');
if (fs.existsSync(instPath)) {
  let instCode = fs.readFileSync(instPath, 'utf8');
  if (!instCode.includes('DEMO_MODE')) {
    instCode = instCode.replace(/if \(process\.env\.NODE_ENV === 'production'\) \{/, `if (process.env.NODE_ENV === 'production') {\n    if (process.env.DEMO_MODE === 'true') throw new Error('DEMO_MODE is true in production');`);
    fs.writeFileSync(instPath, instCode, 'utf8');
  }
}

// B2: verifyJwt.ts aud and iss check
const jwtPath = path.join(__dirname, 'apps/api/lib/domains/auth/verifyJwt.ts');
if (fs.existsSync(jwtPath)) {
  let jwtCode = fs.readFileSync(jwtPath, 'utf8');
  if (!jwtCode.includes('payload.iss')) {
     jwtCode = jwtCode.replace(/if \(payload\.exp && payload\.exp < Math\.floor\(Date\.now\(\) \/ 1000\)\) \{/, 
       `if (payload.iss !== 'supabase' || payload.aud !== 'authenticated') { return null; }\n    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {`);
     fs.writeFileSync(jwtPath, jwtCode, 'utf8');
  }
}

console.log("Phase B automated fixes applied.");
