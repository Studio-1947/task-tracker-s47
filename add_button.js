const fs = require('fs');
let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

c = c.replace(
  /<div className="flex justify-between items-center">\s*<h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Leave Types<\/h2>\s*<div>\s*<label className="cursor-pointer/,
  `<div className="flex justify-between items-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Leave Types</h2>
        <div className="flex items-center gap-3">
          <button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-2 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button>
          <label className="cursor-pointer`
);

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Button added!');
