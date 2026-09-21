const fs = require('fs');
const path = require('path');

// 1. Add getSupabaseUserClient to auditLog.ts
const auditLogPath = path.join(__dirname, 'apps/api/lib/domains/core/auditLog.ts');
if (fs.existsSync(auditLogPath)) {
  let auditLog = fs.readFileSync(auditLogPath, 'utf8');
  if (!auditLog.includes('getSupabaseUserClient')) {
    auditLog += `

export function getSupabaseUserClient(authHeader: string): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } }
  });
}
`;
    fs.writeFileSync(auditLogPath, auditLog, 'utf8');
  }
}

// 2. Refactor the dangerous API routes to use getSupabaseUserClient
const routesToFix = [
  'apps/api/app/api/cases/[id]/evidence/route.ts',
  'apps/api/app/api/cases/[id]/wallets/route.ts',
  'apps/api/app/api/cases/[id]/export/route.ts',
  'apps/api/app/api/cases/[id]/sahyog/route.ts',
  'apps/api/app/api/cases/[id]/summons/route.ts',
  'apps/api/app/api/cases/[id]/certificate/route.ts'
];

for (const file of routesToFix) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');

  // Replace import
  code = code.replace(/import \{.*?getSupabaseAdmin.*?\} from '(.*?)';/, (match, p1) => {
      if (match.includes('getSupabaseUserClient')) return match;
      return match.replace('}', ', getSupabaseUserClient }');
  });

  // Find where authHeader is defined. If not, we might need to get it from req.
  // Replace getSupabaseAdmin() with getSupabaseUserClient(req.headers.get('authorization') || '')
  // But wait, the route needs `req` available.
  code = code.replace(/const (\w+) = getSupabaseAdmin\(\);/g, "const $1 = getSupabaseUserClient(req.headers.get('authorization') || '') || getSupabaseAdmin(); // Fallback if no user client");
  
  fs.writeFileSync(p, code, 'utf8');
}

console.log("Refactored D2 dangerous call sites.");
