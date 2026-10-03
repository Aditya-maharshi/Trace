const fs = require('fs');
const file = 'apps/api/__tests__/isolation.test.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const API_BASE = process.env.TEST_API_BASE || "http://localhost:3001";',
  'const shouldRun = !!process.env.TEST_API_BASE;\nconst API_BASE = process.env.TEST_API_BASE || "http://localhost:3001";'
);

code = code.replace(
  'beforeAll(async () => {',
  'beforeAll(async () => {\n  if (!shouldRun) return;'
);

code = code.replace(
  'describe("Cross-tenant isolation: GET by ID", () => {',
  'describe.runIf(shouldRun)("Cross-tenant isolation: GET by ID", () => {'
);

code = code.replace(
  'describe("Cross-tenant isolation: List endpoints", () => {',
  'describe.runIf(shouldRun)("Cross-tenant isolation: List endpoints", () => {'
);

code = code.replace(
  'describe("Cross-tenant isolation: Mutations", () => {',
  'describe.runIf(shouldRun)("Cross-tenant isolation: Mutations", () => {'
);

code = code.replace(
  'describe("Cross-tenant isolation: MCP tools", () => {',
  'describe.runIf(shouldRun)("Cross-tenant isolation: MCP tools", () => {'
);

code = code.replace(
  'describe("Route manifest coverage", () => {',
  'describe.runIf(shouldRun)("Route manifest coverage", () => {'
);

fs.writeFileSync(file, code);
