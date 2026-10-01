const fs = require('fs');
const path = require('path');
const file = path.join('apps', 'web', 'src', 'pages', 'UsersPage.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/(\s+onDesignation,)(\s+onReset,)/, '$1\n  onGender,$2');

fs.writeFileSync(file, content);
console.log('Fixed onGender destructuring with regex');
