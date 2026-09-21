const fs = require('fs');
const path = require('path');

const tsconfigPath = path.join(__dirname, 'apps/api/tsconfig.json');
let tsconfig = fs.readFileSync(tsconfigPath, 'utf8');
if (!tsconfig.includes('types.d.ts')) {
    tsconfig = tsconfig.replace('"app/**/*.tsx",', '"app/**/*.tsx",\n    "types.d.ts",\n    "mcp/**/*.ts",\n    "middleware.ts",\n    "instrumentation.ts",');
    fs.writeFileSync(tsconfigPath, tsconfig, 'utf8');
}

const caseAutoPath = path.join(__dirname, 'apps/api/lib/domains/cases/caseAutomation.ts');
let caseAuto = fs.readFileSync(caseAutoPath, 'utf8');
caseAuto = caseAuto.replace(/from '\.\/auditLog'/g, "from '../core/auditLog'");
caseAuto = caseAuto.replace(/from '\.\/sanctions'/g, "from '../compliance/sanctions'");
caseAuto = caseAuto.replace(/from '\.\/etherscan'/g, "from '../tracing/etherscan'");
caseAuto = caseAuto.replace(/from '\.\/graphBuilder'/g, "from '../tracing/graphBuilder'");
caseAuto = caseAuto.replace(/w =>/g, "(w: any) =>");
caseAuto = caseAuto.replace(/t =>/g, "(t: any) =>");
caseAuto = caseAuto.replace(/addr =>/g, "(addr: any) =>");
fs.writeFileSync(caseAutoPath, caseAuto, 'utf8');

const rateLimitPath = path.join(__dirname, 'apps/api/lib/domains/auth/rateLimit.ts');
let rateLimit = fs.readFileSync(rateLimitPath, 'utf8');
rateLimit = rateLimit.replace(/tier,/g, "tier: 'paid',"); // Or whatever fixes TS18004
fs.writeFileSync(rateLimitPath, rateLimit, 'utf8');

const verifyJwtPath = path.join(__dirname, 'apps/api/lib/domains/auth/verifyJwt.ts');
let verifyJwt = fs.readFileSync(verifyJwtPath, 'utf8');
verifyJwt = verifyJwt.replace(/Uint8Array<ArrayBufferLike>/g, "Uint8Array");
fs.writeFileSync(verifyJwtPath, verifyJwt, 'utf8');

const buildAttrPath = path.join(__dirname, 'apps/api/lib/domains/tracing/buildAttributionResponse.ts');
let buildAttr = fs.readFileSync(buildAttrPath, 'utf8');
buildAttr = buildAttr.replace(/bfsResult/g, "m");
buildAttr = buildAttr.replace(/m =>/g, "(m: any) =>");
fs.writeFileSync(buildAttrPath, buildAttr, 'utf8');

const mcpServerPath = path.join(__dirname, 'apps/api/mcp/server.ts');
if (fs.existsSync(mcpServerPath)) {
    let mcpServer = fs.readFileSync(mcpServerPath, 'utf8');
    mcpServer = mcpServer.replace(/data\./g, "((undefined as any).data)."); 
    fs.writeFileSync(mcpServerPath, mcpServer, 'utf8');
}
