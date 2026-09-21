const fs = require('fs');
const path = require('path');

const files = [
  "apps/api/app/api/cases/[id]/evidence/route.ts",
  "apps/api/app/api/cases/[id]/export/route.ts",
  "apps/api/app/api/cases/[id]/route.ts",
  "apps/api/app/api/cases/[id]/sahyog/route.ts",
  "apps/api/app/api/cases/[id]/wallets/route.ts",
  "apps/api/app/api/cases/route.ts"
];

for (const file of files) {
  const filePath = path.join(__dirname, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/error: \.Internal Server Error\./g, "error: 'Internal Server Error'");
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file}`);
}
