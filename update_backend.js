const fs = require('fs');

const typesFile = 'c:/Users/soumi/Desktop/task-tracker-s47/packages/shared/src/types.ts';
let typesContent = fs.readFileSync(typesFile, 'utf8');

typesContent = typesContent.replace(
  '  openTasks: number;\n  totalEstimatedMinutes: number;\n}',
  '  openTasks: number;\n  totalEstimatedMinutes: number;\n  predominantSize?: import(\'./enums\').TaskSize | null;\n}'
);

typesContent = typesContent.replace(
  '  openTasks: number;\r\n  totalEstimatedMinutes: number;\r\n}',
  '  openTasks: number;\r\n  totalEstimatedMinutes: number;\r\n  predominantSize?: import(\'./enums\').TaskSize | null;\r\n}'
);

fs.writeFileSync(typesFile, typesContent);


const serviceFile = 'c:/Users/soumi/Desktop/task-tracker-s47/apps/api/src/dashboard/dashboard.service.ts';
let serviceContent = fs.readFileSync(serviceFile, 'utf8');

serviceContent = serviceContent.replace(
  'totalEst: sql<number>`sum(',
  'predominantSize: sql<string>`mode() within group (order by ${tasks.size})`,\n        totalEst: sql<number>`sum('
);

serviceContent = serviceContent.replace(
  'totalEstimatedMinutes: Number(r.totalEst ?? 0),',
  'totalEstimatedMinutes: Number(r.totalEst ?? 0),\n      predominantSize: (r.predominantSize as import(\'@task-tracker/shared\').TaskSize) || null,'
);

fs.writeFileSync(serviceFile, serviceContent);
console.log("Backend updated successfully!");
