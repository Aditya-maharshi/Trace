const fs = require('fs');
const path = require('path');

const files = [
  "apps/api/__tests__/lib/resultStore.test.ts",
  "apps/api/lib/domains/tracing/graphBuilder.ts",
  "apps/api/lib/domains/tracing/buildAttributionResponse.ts",
  "apps/api/lib/domains/tracing/attribution.ts",
  "apps/api/lib/domains/core/resultStore.ts",
  "apps/api/lib/domains/core/methodology.ts",
  "apps/api/lib/domains/compliance/vaspClassification.ts",
  "apps/api/lib/domains/compliance/sahyogAdapter.ts",
  "apps/api/app/api/report/route.ts",
  "apps/api/app/api/cases/[id]/summons/route.ts",
  "apps/api/app/api/cases/[id]/certificate/route.ts",
  "apps/api/app/api/attribute/route.ts"
];

for (const file of files) {
  const filePath = path.join(__dirname, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/from "(\.\.\/)+packages\/shared-types";/g, 'from "@sih/shared-types";');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
}
