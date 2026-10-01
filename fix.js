const fs = require('fs');
const path = require('path');
const file = path.join('apps', 'web', 'src', 'pages', 'UsersPage.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '  onRole,\n  onDesignation,\n  onReset,\n  onDeactivate,\n  onReactivate,',
  '  onRole,\n  onDesignation,\n  onGender,\n  onReset,\n  onDeactivate,\n  onReactivate,'
);

fs.writeFileSync(file, content);
console.log('Fixed onGender destructuring in UsersPage');
