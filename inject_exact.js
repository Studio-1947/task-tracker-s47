const fs = require('fs');

let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

// Add imports safely
if (!c.includes("import { driver }")) {
  c = c.replace(
    "import { Avatar } from '../components/Avatar';",
    "import { Avatar } from '../components/Avatar';\nimport { driver } from 'driver.js';\nimport 'driver.js/dist/driver.css';"
  );
}

// 1. Inject startTour into AttendancePage
const target1 = `  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Attendance</h1>`;

const repl1 = `
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

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Attendance</h1>
        <button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-2 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button>
      </div>`;

c = c.replace(target1, repl1);

// 2. Add IDs safely

// MyAttendanceTab IDs
c = c.replace('<CheckInCard onOpenCorrection={() => setShowCorrectionModal(true)} />', '<div id="tour-checkin"><CheckInCard onOpenCorrection={() => setShowCorrectionModal(true)} /></div>');
c = c.replace('<MonthCalendar onCorrect={() => setShowCorrectionModal(true)} />', '<div id="tour-calendar"><MonthCalendar onCorrect={() => setShowCorrectionModal(true)} /></div>');
c = c.replace('<MyTimingHistory />', '<div id="tour-timing"><MyTimingHistory /></div>');

// LeaveTypesTab IDs and Tooltips
c = c.replace(
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Accrual</label>',
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-accrual">Accrual <span className="cursor-help opacity-70" title="Days automatically credited on the 1st of each month (0 = fixed yearly days)">ⓘ</span></label>'
);
c = c.replace(
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Carry max</label>',
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-carry">Carry max <span className="cursor-help opacity-70" title="Maximum number of unused days that can roll over into the next year">ⓘ</span></label>'
);
c = c.replace(
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Expire(mo)</label>',
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-expire">Expire(mo) <span className="cursor-help opacity-70" title="How many months into the new year before carried-over days expire (blank = never)">ⓘ</span></label>'
);
c = c.replace(
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Carry Policy</label>',
  '<label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" id="tour-policy">Carry Policy <span className="cursor-help opacity-70" title="Lapse: Rolls over up to max. Carry All: Entire balance rolls over. No Carry: Resets to 0.">ⓘ</span></label>'
);

// ApprovalsTab IDs
// Using a specific string in ApprovalsTab:
const approvalsTarget1 = `<div className="flex items-center gap-2">
          {['PENDING', 'APPROVED', 'DECLINED'].map((s) => (`;
const approvalsRepl1 = `<div className="flex items-center gap-2" id="tour-filter">
          {['PENDING', 'APPROVED', 'DECLINED'].map((s) => (`;
c = c.replace(approvalsTarget1, approvalsRepl1);

const approvalsTarget2 = `return (
    <div className="space-y-4 animate-fade-in">`;
const approvalsRepl2 = `return (
    <div className="space-y-4 animate-fade-in" id="tour-reqs">`;
c = c.replace(approvalsTarget2, approvalsRepl2);

// AllotmentsTab IDs
const allotmentsTarget1 = `return (
    <div className="space-y-5 animate-fade-in">
      <Card className="p-5">`;
const allotmentsRepl1 = `return (
    <div className="space-y-5 animate-fade-in">
      <div id="tour-user-select"><Card className="p-5">`;
c = c.replace(allotmentsTarget1, allotmentsRepl1);

// We need to add the closing </div> for the Card. It's followed by "Selected User Balances"
const allotmentsTarget2 = `</Card>

      {selectedUserId ? (`;
const allotmentsRepl2 = `</Card></div>

      {selectedUserId ? (`;
c = c.replace(allotmentsTarget2, allotmentsRepl2);

const allotmentsTarget3 = `<div className="space-y-3">
            {balances.map((b) => (`;
const allotmentsRepl3 = `<div className="space-y-3" id="tour-balances">
            {balances.map((b) => (`;
c = c.replace(allotmentsTarget3, allotmentsRepl3);


// TeamLogTab IDs
const teamLogTarget1 = `return (
    <div className="space-y-5 animate-fade-in">
      <Card className="p-5">`;
const teamLogRepl1 = `return (
    <div className="space-y-5 animate-fade-in">
      <div id="tour-log-date"><Card className="p-5">`;
c = c.replace(teamLogTarget1, teamLogRepl1);

const teamLogTarget2 = `</Card>

      {logsQuery.data?.length === 0 ? (`;
const teamLogRepl2 = `</Card></div>

      {logsQuery.data?.length === 0 ? (`;
c = c.replace(teamLogTarget2, teamLogRepl2);

const teamLogTarget3 = `<div className="space-y-2.5">
          {logsQuery.data?.map((p) => (`;
const teamLogRepl3 = `<div className="space-y-2.5" id="tour-log-punches">
          {logsQuery.data?.map((p) => (`;
c = c.replace(teamLogTarget3, teamLogRepl3);


// CorrectionsReviewTab IDs
const corrTarget1 = `<div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">`;
const corrRepl1 = `<div className="flex items-center justify-between gap-4" id="tour-corr-filter">
        <div className="flex gap-2">`;
c = c.replace(corrTarget1, corrRepl1);

const corrTarget2 = `return (
    <div className="space-y-4 animate-fade-in">`;
const corrRepl2 = `return (
    <div className="space-y-4 animate-fade-in" id="tour-corr-list">`;
// Wait, CorrectionsReviewTab has `return (<div className="space-y-4 animate-fade-in">` just like ApprovalsTab. Let's make sure it replaces the right one.
// The easiest is to use `replace` with the actual full signature.
c = c.replace(
  /function CorrectionsReviewTab\(\) \{[\s\S]*?return \(\n    <div className="space-y-4 animate-fade-in">/,
  (match) => match.replace('<div className="space-y-4 animate-fade-in">', '<div className="space-y-4 animate-fade-in" id="tour-corr-list">')
);


fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Attendance tour perfectly patched!');
