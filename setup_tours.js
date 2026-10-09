const fs = require('fs');

let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

if (!c.includes("import { driver }")) {
  c = c.replace(
    "import { Avatar } from '../components/Avatar';",
    "import { Avatar } from '../components/Avatar';\nimport { driver } from 'driver.js';\nimport 'driver.js/dist/driver.css';"
  );
}

const tourFunction = `
  const startTour = () => {
    let steps = [];
    if (tab === 'me') {
      steps = [
        { element: '#tour-checkin', popover: { title: 'Check In/Out', description: 'Use this button to record your daily attendance. The system captures your timestamp and approximate location automatically.' } },
        { element: '#tour-calendar', popover: { title: 'Attendance Calendar', description: 'See your complete monthly history at a glance. Weekends and approved holidays are automatically highlighted.' } },
        { element: '#tour-timing', popover: { title: 'Timing History', description: 'A breakdown of your exact punches for the last 7 days.' } }
      ];
    } else if (tab === 'types') {
      steps = [
        { element: '#tour-accrual', popover: { title: 'Monthly Accrual', description: 'Instead of an annual lump-sum, enter how many days employees earn each month. Set to 0 if you use a fixed annual default.', side: 'bottom', align: 'start' } },
        { element: '#tour-carry', popover: { title: 'Carry Forward Max', description: 'At the end of the year, this is the maximum number of unused days that can roll over into the new year. Enter 0 for no rollover.', side: 'bottom', align: 'start' } },
        { element: '#tour-expire', popover: { title: 'Expiry Months', description: 'If days roll over, how many months do they have to use them before they lapse? (e.g., 3 means they expire March 31st). Leave blank for never.', side: 'bottom', align: 'start' } },
        { element: '#tour-policy', popover: { title: 'Carry Policy', description: 'Choose whether balances lapse after reaching the max cap, carry over completely without a cap, or just reset to 0 every Jan 1st.', side: 'bottom', align: 'start' } }
      ];
    } else if (tab === 'approvals') {
      steps = [
        { element: '#tour-filter', popover: { title: 'Status Filter', description: 'Toggle between Pending, Approved, and Declined leave requests.', side: 'bottom' } },
        { element: '#tour-reqs', popover: { title: 'Leave Requests', description: 'Review requests from your team. If a request causes a staffing clash, the system will warn you in orange.', side: 'top' } }
      ];
    } else if (tab === 'allotments') {
      steps = [
        { element: '#tour-user-select', popover: { title: 'Select Member', description: 'Pick an employee to view or modify their leave balances.', side: 'bottom' } },
        { element: '#tour-balances', popover: { title: 'Allotments', description: 'Override the default number of days granted for this specific user. This overrides the company-wide default balance.', side: 'top' } }
      ];
    } else if (tab === 'team') {
      steps = [
        { element: '#tour-log-date', popover: { title: 'Select Date', description: 'Pick any date to view the attendance log for the entire team.', side: 'bottom' } },
        { element: '#tour-log-punches', popover: { title: 'Team Punches', description: 'See exactly when team members checked in and out, and their total hours for the day.', side: 'top' } }
      ];
    } else if (tab === 'corrections') {
      steps = [
        { element: '#tour-corr-filter', popover: { title: 'Filter Corrections', description: 'Filter corrections by status to manage your backlog.', side: 'bottom' } },
        { element: '#tour-corr-list', popover: { title: 'Approve or Reject', description: 'Review why someone is requesting a time correction. Approving will permanently overwrite their punch record for that day.', side: 'top' } }
      ];
    }

    if (steps.length > 0) {
      driver({ showProgress: true, steps }).drive();
    } else {
      alert("A tour is not available for this tab yet.");
    }
  };
`;

c = c.replace(/return \(\n    <div className="animate-fade-in">/, tourFunction + '\n  return (\n    <div className="animate-fade-in">');

c = c.replace(
  /<h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Attendance<\/h1>/,
  `<div className="flex justify-between items-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Attendance</h1>
        <button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-2 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button>
      </div>`
);


// Inject IDs safely

// MyAttendanceTab
c = c.replace(/<CheckInCard/, '<div id="tour-checkin"><CheckInCard');
c = c.replace(/<\/CheckInCard>/, '</CheckInCard></div>');
c = c.replace(/<MonthCalendar/, '<div id="tour-calendar"><MonthCalendar');
c = c.replace(/<\/MonthCalendar>/, '</MonthCalendar></div>');
c = c.replace(/<MyTimingHistory \/>/, '<div id="tour-timing"><MyTimingHistory /></div>');

// ApprovalsTab
c = c.replace(/<div className="flex items-center gap-2">/, '<div className="flex items-center gap-2" id="tour-filter">');
c = c.replace(/<div className="space-y-2\.5">/, '<div className="space-y-2.5" id="tour-reqs">');

// LeaveTypesTab
c = c.replace(/<div className="w-24">\s*<label(.*?)>Accrual/, '<div className="w-24" id="tour-accrual">\n              <label$1>Accrual');
c = c.replace(/<div className="w-24">\s*<label(.*?)>Carry max/, '<div className="w-24" id="tour-carry">\n              <label$1>Carry max');
c = c.replace(/<div className="w-24">\s*<label(.*?)>Expire\(mo\)/, '<div className="w-24" id="tour-expire">\n              <label$1>Expire(mo)');
c = c.replace(/<div className="w-32">\s*<label(.*?)>Carry Policy/, '<div className="w-32" id="tour-policy">\n              <label$1>Carry Policy');
// Add tooltips back
c = c.replace(/>Default<\/label>/g, '>Default <span className="cursor-help opacity-70" title="Fixed number of days granted per year if no monthly accrual is set">ⓘ</span></label>');
c = c.replace(/>Accrual<\/label>/g, '>Accrual <span className="cursor-help opacity-70" title="Days automatically credited on the 1st of each month (0 = fixed yearly days)">ⓘ</span></label>');
c = c.replace(/>Carry max<\/label>/g, '>Carry max <span className="cursor-help opacity-70" title="Maximum number of unused days that can roll over into the next year">ⓘ</span></label>');
c = c.replace(/>Expire\(mo\)<\/label>/g, '>Expire(mo) <span className="cursor-help opacity-70" title="How many months into the new year before carried-over days expire (blank = never)">ⓘ</span></label>');
c = c.replace(/>Carry Policy<\/label>/g, '>Carry Policy <span className="cursor-help opacity-70" title="Lapse: Rolls over up to \'Carry max\'. Carry All: Entire balance rolls over. No Carry: Resets to 0.">ⓘ</span></label>');


// AllotmentsTab
c = c.replace(/function AllotmentsTab[\s\S]*?<Card className="p-5">/, (match) => match.replace('<Card className="p-5">', '<div id="tour-user-select"><Card className="p-5">'));
c = c.replace(/function AllotmentsTab[\s\S]*?<\/Card>/, (match) => match.replace('</Card>', '</Card></div>'));
c = c.replace(/function AllotmentsTab[\s\S]*?<div className="space-y-3">/, (match) => match.replace('<div className="space-y-3">', '<div className="space-y-3" id="tour-balances">'));

// TeamLogTab
c = c.replace(/function TeamLogTab[\s\S]*?<Card className="p-5">/, (match) => match.replace('<Card className="p-5">', '<div id="tour-log-date"><Card className="p-5">'));
c = c.replace(/function TeamLogTab[\s\S]*?<\/Card>/, (match) => match.replace('</Card>', '</Card></div>'));
c = c.replace(/function TeamLogTab[\s\S]*?<div className="space-y-2\.5">/, (match) => match.replace('<div className="space-y-2.5">', '<div className="space-y-2.5" id="tour-log-punches">'));


// CorrectionsReviewTab
c = c.replace(/<div className="flex items-center justify-between gap-4">/, '<div className="flex items-center justify-between gap-4" id="tour-corr-filter">');
c = c.replace(/function CorrectionsReviewTab[\s\S]*?<div className="space-y-2\.5">/, (match) => match.replace('<div className="space-y-2.5">', '<div className="space-y-2.5" id="tour-corr-list">'));

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Centralized tour added!');
