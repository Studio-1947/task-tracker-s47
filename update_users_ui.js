const fs = require('fs');
const path = require('path');
const file = path.join('apps', 'web', 'src', 'pages', 'UsersPage.tsx');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('GenderType')) {
  content = content.replace(
    /type UserSummary,/,
    "type GenderType,\n  type UserSummary,"
  );
}

content = content.replace(
  "const [designation, setDesignation] = useState('');",
  "const [designation, setDesignation] = useState('');\n  const [gender, setGender] = useState<GenderType>('UNSPECIFIED');"
);

content = content.replace(
  "designation: designation.trim() || undefined,",
  "designation: designation.trim() || undefined,\n        gender,"
);

content = content.replace(
  "setDesignation('');",
  "setDesignation('');\n      setGender('UNSPECIFIED');"
);

content = content.replace(
  /<div className="sm:col-span-1">\s*<label className="mb-1\.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Designation<\/label>\s*<Input placeholder="Director, Analyst…" value=\{designation\} onChange=\{\(e\) => setDesignation\(e\.target\.value\)\} \/>\s*<\/div>/,
  `$&
              <div className="sm:col-span-1">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Gender</label>
                <select
                  aria-label="New user gender"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1a] px-3.5 py-2.5 text-sm text-slate-700 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-semibold"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderType)}
                >
                  <option value="UNSPECIFIED">Unspecified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>`
);

content = content.replace(
  /<form className="grid grid-cols-1 gap-4 sm:grid-cols-5 sm:items-end"/,
  '<form className="grid grid-cols-1 gap-4 sm:grid-cols-6 sm:items-end"'
);

fs.writeFileSync(file, content);
console.log('updated users page ui');
