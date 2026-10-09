const fs = require('fs');
let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

// 1. Add imports
if (!c.includes("import { driver }")) {
  c = c.replace(
    "import { Avatar } from '../components/Avatar';",
    "import { Avatar } from '../components/Avatar';\nimport { driver } from 'driver.js';\nimport 'driver.js/dist/driver.css';"
  );
}

// 2. Add IDs to the elements we want to tour
c = c.replace(/<div className="w-24">\s*<label(.*?)>Accrual/, '<div className="w-24" id="tour-accrual">\n              <label$1>Accrual');
c = c.replace(/<div className="w-24">\s*<label(.*?)>Carry max/, '<div className="w-24" id="tour-carry">\n              <label$1>Carry max');
c = c.replace(/<div className="w-24">\s*<label(.*?)>Expire\(mo\)/, '<div className="w-24" id="tour-expire">\n              <label$1>Expire(mo)');
c = c.replace(/<div className="w-32">\s*<label(.*?)>Carry Policy/, '<div className="w-32" id="tour-policy">\n              <label$1>Carry Policy');

// 3. Add the startTour function inside LeaveTypesTab
const tourFunction = `
  const startTour = () => {
    const d = driver({
      showProgress: true,
      steps: [
        { element: '#tour-accrual', popover: { title: 'Monthly Accrual', description: 'Instead of an annual lump-sum, enter how many days employees earn each month. Set to 0 if you use a fixed annual default.', side: 'bottom', align: 'start' } },
        { element: '#tour-carry', popover: { title: 'Carry Forward Max', description: 'At the end of the year, this is the maximum number of unused days that can roll over into the new year. Enter 0 for no rollover.', side: 'bottom', align: 'start' } },
        { element: '#tour-expire', popover: { title: 'Expiry Months', description: 'If days roll over, how many months do they have to use them before they lapse? (e.g., 3 means they expire March 31st). Leave blank for never.', side: 'bottom', align: 'start' } },
        { element: '#tour-policy', popover: { title: 'Carry Policy', description: 'Choose whether balances lapse after reaching the max cap, carry over completely without a cap, or just reset to 0 every Jan 1st.', side: 'bottom', align: 'start' } }
      ]
    });
    d.drive();
  };
`;

if (!c.includes("const startTour = () => {")) {
  c = c.replace(
    "const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {",
    tourFunction + "\n  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {"
  );
}

// 4. Add the button to the header
const headerTarget = `<div className="flex justify-between items-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Leave Types</h2>
        <div>`;
const headerReplacement = `<div className="flex justify-between items-center">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Leave Types</h2>
        <div className="flex gap-2">
          <button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-2 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button>`;

if (c.includes(headerTarget)) {
  c = c.replace(headerTarget, headerReplacement);
}

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Driver tour added!');
