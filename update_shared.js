const fs = require('fs');
const path = require('path');

function replaceInFileRegex(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [searchRegex, replaceText] of replacements) {
    if (searchRegex.test(content)) {
      content = content.replace(searchRegex, replaceText);
    } else {
      console.log(`Could not find snippet in ${filePath}:\n${searchRegex}`);
    }
  }
  fs.writeFileSync(filePath, content);
}

// 1. Update types.ts
replaceInFileRegex(path.join('packages', 'shared', 'src', 'types.ts'), [
  [
    /\} from '\.\/enums';/,
    "} from './enums';\n\nexport type GenderType = 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';\nexport type ApplicableGenderType = 'ALL' | 'MALE' | 'FEMALE' | 'OTHER';"
  ],
  [
    /  designation: string \| null;\r?\n  isActive: boolean;\r?\n  mustChangePassword: boolean;\r?\n\}/,
    "  designation: string | null;\n  gender: GenderType;\n  isActive: boolean;\n  mustChangePassword: boolean;\n}"
  ],
  [
    /  designation: string \| null;\r?\n  isActive: boolean;\r?\n  \/\*\*\r?\n   \* When the person was removed/,
    "  designation: string | null;\n  gender: GenderType;\n  isActive: boolean;\n  /**\n   * When the person was removed"
  ],
  [
    /  wfhEntitlementDays: number;\r?\n  policyNotes: string \| null;\r?\n  isActive: boolean;\r?\n\}/,
    "  wfhEntitlementDays: number;\n  policyNotes: string | null;\n  applicableGender: ApplicableGenderType;\n  isActive: boolean;\n}"
  ]
]);

// 2. Update schemas/user.ts
replaceInFileRegex(path.join('packages', 'shared', 'src', 'schemas', 'user.ts'), [
  [
    /  designation: z\.string\(\)\.max\(120\)\.nullable\(\)\.optional\(\),\r?\n\}\);/,
    "  designation: z.string().max(120).nullable().optional(),\n  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).default('UNSPECIFIED'),\n});"
  ],
  [
    /  designation: z\.string\(\)\.max\(120\)\.nullable\(\)\.optional\(\),\r?\n  role: z\.enum\(\['MEMBER', 'ADMIN', 'OWNER'\]\)\.optional\(\),/,
    "  designation: z.string().max(120).nullable().optional(),\n  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']).optional(),\n  role: z.enum(['MEMBER', 'ADMIN', 'OWNER']).optional(),"
  ]
]);

// 3. Update schemas/attendance.ts
replaceInFileRegex(path.join('packages', 'shared', 'src', 'schemas', 'attendance.ts'), [
  [
    /  policyNotes: z\.string\(\)\.max\(1000\)\.nullable\(\)\.optional\(\),\r?\n\}\);/,
    "  policyNotes: z.string().max(1000).nullable().optional(),\n  applicableGender: z.enum(['ALL', 'MALE', 'FEMALE', 'OTHER']).default('ALL'),\n});"
  ],
  [
    /    policyNotes: z\.string\(\)\.max\(1000\)\.nullable\(\)\.optional\(\),\r?\n    isActive: z\.boolean\(\)\.optional\(\),\r?\n  \}\)\r?\n  \.strict\(\);/,
    "    policyNotes: z.string().max(1000).nullable().optional(),\n    applicableGender: z.enum(['ALL', 'MALE', 'FEMALE', 'OTHER']).optional(),\n    isActive: z.boolean().optional(),\n  })\n  .strict();"
  ]
]);

console.log('Shared types and schemas updated!');
