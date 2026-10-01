const fs = require('fs');
const path = require('path');
const file = path.join('apps', 'web', 'src', 'pages', 'AttendancePage.tsx');
let content = fs.readFileSync(file, 'utf8');

// Import ApplicableGenderType
if (!content.includes('ApplicableGenderType')) {
  content = content.replace(
    /import \{\s*ApprovalRequiredType,/,
    "import {\n  ApplicableGenderType,\n  ApprovalRequiredType,"
  );
}

// Update state initialization
content = content.replace(
  "const [wfhEntitlementDays, setWfhEntitlementDays] = useState<number | ''>('');",
  "const [wfhEntitlementDays, setWfhEntitlementDays] = useState<number | ''>('');\n  const [applicableGender, setApplicableGender] = useState<ApplicableGenderType>('ALL' as ApplicableGenderType);"
);

// Update create.mutateAsync call
content = content.replace(
  "entitlementUnit, wfhEntitlementDays: wfhEntitlementDays === '' ? 0 : Number(wfhEntitlementDays), policyNotes: policyNotes || undefined });",
  "entitlementUnit, wfhEntitlementDays: wfhEntitlementDays === '' ? 0 : Number(wfhEntitlementDays), applicableGender, policyNotes: policyNotes || undefined });"
);

// Add Applicable Gender select in the creation form
content = content.replace(
  /<div className="w-24">\s*<label className="mb-1 block[^>]*>WFH Days<\/label>\s*<Input type="number" min=\{0\} max=\{365\} value=\{wfhEntitlementDays\}[^>]*\/>\s*<\/div>/,
  `$&
            <div className="w-28">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Gender</label>
              <select className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm bg-white dark:bg-[#252525] dark:text-white" value={applicableGender} onChange={(e) => setApplicableGender(e.target.value as ApplicableGenderType)}>
                <option value="ALL">All</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>`
);

// Add Applicable Gender in the list mapping
content = content.replace(
  /<label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">\s*Unit\s*<select[^>]*defaultValue=\{t\.entitlementUnit \?\? 'DAYS'\}[^>]*onChange=\{\(e\) => update\.mutate\(\{ id: t\.id, patch: \{ entitlementUnit: e\.target\.value as EntitlementUnitType \} \}\)\}[^>]*>\s*<option value="DAYS">Days<\/option>\s*<option value="MONTHS">Months<\/option>\s*<\/select>\s*<\/label>/,
  `$&
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Gender
                  <select
                    className="w-24 rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm bg-white dark:bg-[#252525] dark:text-white"
                    defaultValue={t.applicableGender ?? 'ALL'}
                    onChange={(e) => update.mutate({ id: t.id, patch: { applicableGender: e.target.value as ApplicableGenderType } })}
                  >
                    <option value="ALL">All</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>`
);

fs.writeFileSync(file, content);
console.log('updated attendance page ui');
