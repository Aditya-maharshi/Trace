const fs = require('fs');
const path = require('path');

// C4: Redis IP stripping
const rateLimitPath = path.join(__dirname, 'apps/api/lib/domains/auth/rateLimit.ts');
if (fs.existsSync(rateLimitPath)) {
  let rateLimit = fs.readFileSync(rateLimitPath, 'utf8');
  rateLimit = rateLimit.replace(/const ip = opts\.ip \|\| "unknown";/, 'const ip = (opts.ip || "unknown").replace(/:/g, "_");');
  fs.writeFileSync(rateLimitPath, rateLimit, 'utf8');
}

// C6: JSON.parse try/catch
const c6Files = [
  'apps/api/app/api/cases/[id]/sahyog/route.ts',
  'apps/api/app/api/cases/[id]/summons/route.ts',
  'apps/api/app/api/cases/[id]/certificate/route.ts'
];
for (const file of c6Files) {
  const p = path.join(__dirname, file);
  if (fs.existsSync(p)) {
    let code = fs.readFileSync(p, 'utf8');
    code = code.replace(/const scopes = JSON\.parse\(scopesHeader\);/g, 'let scopes = []; try { scopes = JSON.parse(scopesHeader); } catch(e) {}');
    fs.writeFileSync(p, code, 'utf8');
  }
}

// B8: MFA Enforcement for government users
const verifyJwtPath = path.join(__dirname, 'apps/api/lib/domains/auth/verifyJwt.ts');
if (fs.existsSync(verifyJwtPath)) {
  let jwt = fs.readFileSync(verifyJwtPath, 'utf8');
  if (!jwt.includes("payload.aal !== 'aal2'")) {
    jwt = jwt.replace(/return payload;/g, `
    // Enforce MFA for government role
    if (payload.role === 'government' && payload.aal !== 'aal2') {
      console.warn("Blocked government access without AAL2");
      return null;
    }
    return payload;
    `);
    fs.writeFileSync(verifyJwtPath, jwt, 'utf8');
  }
}

// B9: RLS Migration
const migrationsDir = path.join(__dirname, 'apps/web/supabase/migrations');
if (fs.existsSync(migrationsDir)) {
  const migrationPath = path.join(migrationsDir, '20260921000000_secure_auth.sql');
  const migrationSql = `-- Prevent privilege escalation
REVOKE UPDATE ON orgs FROM authenticated;
REVOKE UPDATE ON api_keys FROM authenticated;
`;
  fs.writeFileSync(migrationPath, migrationSql, 'utf8');
}

// B0b: Guest flow token
const caseStorePath = path.join(__dirname, 'apps/api/lib/domains/cases/caseStore.ts');
if (fs.existsSync(caseStorePath)) {
  let caseStore = fs.readFileSync(caseStorePath, 'utf8');
  caseStore = caseStore.replace(/export function assertCaseAccess\(caseRow: any, userId: string, orgId\?: string\): boolean \{[\s\S]*?return false;\n\}/, 
`export function assertCaseAccess(caseRow: any, userId: string, orgId?: string, guestToken?: string): boolean {
  if (!caseRow) return false;
  if (userId && (caseRow.user_id === userId || caseRow.analyst_id === userId)) return true;
  if (orgId && caseRow.org_id === orgId) return true;
  if (caseRow.user_id === null && guestToken && caseRow.metadata?.guest_token === guestToken) return true;
  return false;
}`);
  fs.writeFileSync(caseStorePath, caseStore, 'utf8');
}

// Update call sites for B0b guest token
const callSites = [
  'apps/api/app/api/cases/[id]/route.ts',
  'apps/api/app/api/cases/[id]/wallets/route.ts',
  'apps/api/app/api/cases/[id]/export/route.ts',
  'apps/api/app/api/cases/[id]/evidence/route.ts'
];
for (const file of callSites) {
  const p = path.join(__dirname, file);
  if (fs.existsSync(p)) {
    let code = fs.readFileSync(p, 'utf8');
    // Inject guest token read
    if (!code.includes('const guestToken = req.headers.get')) {
      code = code.replace(/let secureOrgId = req\.headers\.get\('x-tenant-org-id'\) \|\| undefined;/g, 
        `let secureOrgId = req.headers.get('x-tenant-org-id') || undefined;
  const guestToken = req.headers.get('x-guest-token') || undefined;`);
    }
    // Update assertCaseAccess calls
    code = code.replace(/assertCaseAccess\(([^,]+), userId, secureOrgId\)/g, 'assertCaseAccess($1, userId, secureOrgId, guestToken)');
    fs.writeFileSync(p, code, 'utf8');
  }
}

console.log("Decision items fixed.");
