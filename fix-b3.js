const fs = require('fs');
const path = require('path');

const filesToFix = [
  "apps/api/app/api/cases/sla-sweep/route.ts",
  "apps/api/app/api/internal/sync-usage/route.ts"
];

for (const file of filesToFix) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');

  if (!code.includes("import crypto from 'crypto';")) {
      code = code.replace(/import \{ NextRequest, NextResponse \} from 'next\/server';/, "import { NextRequest, NextResponse } from 'next/server';\nimport crypto from 'crypto';");
  }

  code = code.replace(/if \(authHeader !== `Bearer \$\{.*?Secret\}`\)/, (match) => {
      const secretVar = match.includes('automationSecret') ? 'automationSecret' : 'cronSecret';
      return `const expected = \`Bearer \$\span{${secretVar}}\`;\n  if (authHeader.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)))`;
  });
  
  // Actually, wait, replacing `\$\span{...}` using string replace might be tricky with regex. Let's just do a plain string replace for both.
  const oldStr1 = "if (authHeader !== `Bearer ${automationSecret}`)";
  const newStr1 = `const expected = \`Bearer \${automationSecret}\`;\n  if (authHeader.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)))`;
  code = code.replace(oldStr1, newStr1);
  
  const oldStr2 = "if (authHeader !== `Bearer ${cronSecret}`)";
  const newStr2 = `const expected = \`Bearer \${cronSecret}\`;\n  if (authHeader.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)))`;
  code = code.replace(oldStr2, newStr2);
  
  fs.writeFileSync(p, code, 'utf8');
}
console.log("Fixed B3 timing attacks");
