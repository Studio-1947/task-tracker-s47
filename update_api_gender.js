const fs = require('fs');
const path = require('path');

function replaceInFile(filepath, regex, replacement) {
  let content = fs.readFileSync(filepath, 'utf8');
  content = content.replace(regex, replacement);
  fs.writeFileSync(filepath, content);
}

// 1. users.service.ts
const usersService = path.join('apps', 'api', 'src', 'users', 'users.service.ts');
replaceInFile(
  usersService,
  /designation: users\.designation,(\s*)isActive: users\.isActive,/g,
  "designation: users.designation,\n        gender: users.gender,$1isActive: users.isActive,"
);

// 2. search.service.ts
const searchService = path.join('apps', 'api', 'src', 'search', 'search.service.ts');
replaceInFile(
  searchService,
  /designation: users\.designation,(\s*)isActive: users\.isActive,/g,
  "designation: users.designation,\n          gender: users.gender,$1isActive: users.isActive,"
);

// 3. auth.service.ts
const authService = path.join('apps', 'api', 'src', 'auth', 'auth.service.ts');
replaceInFile(
  authService,
  /designation: users\.designation,(\s*)isActive: users\.isActive,/g,
  "designation: users.designation,\n        gender: users.gender,$1isActive: users.isActive,"
);

console.log('updated API files for gender');
