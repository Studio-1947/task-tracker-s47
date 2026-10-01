const fs = require('fs');
const path = require('path');
const file = path.join('apps', 'web', 'src', 'pages', 'UsersPage.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add onGender to UserTable props type
content = content.replace(
  /onDesignation: \(u: UserSummary, designation: string \| null\) => void;/,
  "onDesignation: (u: UserSummary, designation: string | null) => void;\n  onGender: (u: UserSummary, gender: GenderType) => void;"
);

// 2. Add Gender to <thead>
content = content.replace(
  /<th className="px-4 py-3 font-semibold">Designation<\/th>/,
  '<th className="px-4 py-3 font-semibold">Designation</th>\n            <th className="px-4 py-3 font-semibold">Gender</th>'
);

// 3. Add Gender to <tbody>
content = content.replace(
  /<td className="px-4 py-3">\s*<DesignationCell\s*key=\{`\$\{u\.id\}-\$\{u\.designation \?\? ''\}`\}\s*value=\{u\.designation\}\s*userName=\{u\.name\}\s*disabled=\{busy \|\| status === 'REMOVED'\}\s*onCommit=\{\(next\) => onDesignation\(u, next\)\}\s*\/>\s*<\/td>/,
  `$&
                <td className="px-4 py-3">
                  <select
                    aria-label={\`Gender for \${u.name}\`}
                    className="rounded-lg border border-slate-200 dark:border-slate-850 px-2 py-1 text-xs text-slate-700 dark:text-white bg-white dark:bg-[#1a1a1a] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 transition-all font-semibold disabled:opacity-60"
                    value={u.gender ?? 'UNSPECIFIED'}
                    onChange={(e) => onGender(u, e.target.value as GenderType)}
                    disabled={busy || status === 'REMOVED'}
                  >
                    <option value="UNSPECIFIED">Unspecified</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </td>`
);

// 4. Add onGender to tableProps
content = content.replace(
  /onDesignation: \(u: UserSummary, designation: string \| null\) => patchUser\(u, \{ designation \}\),/,
  "onDesignation: (u: UserSummary, designation: string | null) => patchUser(u, { designation }),\n    onGender: (u: UserSummary, gender: GenderType) => patchUser(u, { gender }),"
);

fs.writeFileSync(file, content);
console.log('updated UsersPage.tsx');
