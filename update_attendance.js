const fs = require('fs');
const path = require('path');
const file = path.join('apps', 'api', 'src', 'attendance', 'attendance.service.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /return types\.map\(\(t\) => \{/g,
  "const validTypes = types.filter(t => t.applicableGender === 'ALL' || t.applicableGender === person?.gender);\n    return validTypes.map((t) => {"
);

fs.writeFileSync(file, content);
console.log('updated attendance.service.ts');
