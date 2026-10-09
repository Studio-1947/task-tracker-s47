const fs = require('fs');

let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

function injectTour(c, tabName, tourDef, headerMatcher, buttonHtml, idReplacements) {
  // Apply ID replacements
  idReplacements.forEach(([pattern, repl]) => {
    c = c.replace(pattern, repl);
  });

  // Inject startTour and button
  const startTourStr = `
  const startTour = () => {
    driver({
      showProgress: true,
      steps: ${JSON.stringify(tourDef)}
    }).drive();
  };
  `;

  // Find the component start to inject startTour
  const compRegex = new RegExp(`(function ${tabName}\\(.*?\\) \\{\\s*(const.*?;\\s*)*)`);
  c = c.replace(compRegex, `$1${startTourStr}`);

  // Inject button
  c = c.replace(headerMatcher, buttonHtml);

  return c;
}

// 1. MyAttendanceTab
c = injectTour(
  c,
  'MyAttendanceTab',
  [
    { element: '#tour-checkin', popover: { title: 'Check In/Out', description: 'Use this button to record your daily attendance. The system captures your timestamp and approximate location automatically.' } },
    { element: '#tour-calendar', popover: { title: 'Attendance Calendar', description: 'See your complete monthly history at a glance. Weekends and approved holidays are automatically highlighted.' } },
    { element: '#tour-timing', popover: { title: 'Timing History', description: 'A breakdown of your exact punches for the last 7 days.' } }
  ],
  /<div className="col-span-1 xl:col-span-3 space-y-6">/,
  `<div className="col-span-1 xl:col-span-3 space-y-6">
        <div className="flex justify-end mb-2"><button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-1.5 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button></div>`,
  [
    [/<CheckInCard/, '<div id="tour-checkin"><CheckInCard'],
    [/<\/CheckInCard>/, '</CheckInCard></div>'],
    [/<MonthCalendar/, '<div id="tour-calendar"><MonthCalendar'],
    [/<\/MonthCalendar>/, '</MonthCalendar></div>'],
    [/<MyTimingHistory \/>/, '<div id="tour-timing"><MyTimingHistory /></div>']
  ]
);

// 2. ApprovalsTab
c = injectTour(
  c,
  'ApprovalsTab',
  [
    { element: '#tour-filter', popover: { title: 'Status Filter', description: 'Toggle between Pending, Approved, and Declined leave requests.' } },
    { element: '#tour-reqs', popover: { title: 'Leave Requests', description: 'Review requests from your team. If a request causes a staffing clash, the system will warn you in orange.' } }
  ],
  /<div className="flex items-center gap-2">/,
  `<div className="flex justify-end mb-2"><button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-1.5 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button></div>
      <div className="flex items-center gap-2" id="tour-filter">`,
  [
    [/<div className="space-y-2\.5">/, '<div className="space-y-2.5" id="tour-reqs">']
  ]
);

// 3. AllotmentsTab
c = injectTour(
  c,
  'AllotmentsTab',
  [
    { element: '#tour-user-select', popover: { title: 'Select Member', description: 'Pick an employee to view or modify their leave balances.' } },
    { element: '#tour-balances', popover: { title: 'Allotments', description: 'Override the default number of days granted for this specific user. This overrides the company-wide default balance.' } }
  ],
  /<Card className="p-5">/,
  `<div className="flex justify-end mb-2"><button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-1.5 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button></div>
      <Card className="p-5" id="tour-user-select">`,
  [
    [/<div className="space-y-3">/, '<div className="space-y-3" id="tour-balances">']
  ]
);

// 4. TeamLogTab
c = injectTour(
  c,
  'TeamLogTab',
  [
    { element: '#tour-log-date', popover: { title: 'Select Date', description: 'Pick any date to view the attendance log for the entire team.' } },
    { element: '#tour-log-punches', popover: { title: 'Team Punches', description: 'See exactly when team members checked in and out, and their total hours for the day.' } }
  ],
  /<Card className="p-5">/,
  `<div className="flex justify-end mb-2"><button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-1.5 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button></div>
      <Card className="p-5" id="tour-log-date">`,
  [
    [/<div className="space-y-2\.5">/, '<div className="space-y-2.5" id="tour-log-punches">']
  ]
);

// 5. CorrectionsReviewTab
c = injectTour(
  c,
  'CorrectionsReviewTab',
  [
    { element: '#tour-corr-filter', popover: { title: 'Filter Corrections', description: 'Filter corrections by status to manage your backlog.' } },
    { element: '#tour-corr-list', popover: { title: 'Approve or Reject', description: 'Review why someone is requesting a time correction. Approving will permanently overwrite their punch record for that day.' } }
  ],
  /<div className="flex items-center justify-between gap-4">/,
  `<div className="flex justify-end mb-2"><button type="button" onClick={startTour} className="rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-1.5 text-sm font-semibold dark:border-indigo-500/30 dark:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors">✨ Take a Tour</button></div>
      <div className="flex items-center justify-between gap-4" id="tour-corr-filter">`,
  [
    [/<div className="space-y-2\.5">/, '<div className="space-y-2.5" id="tour-corr-list">']
  ]
);

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('All tabs gamified!');
