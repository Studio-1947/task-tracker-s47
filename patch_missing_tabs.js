const fs = require('fs');

let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

const additionalSteps = `    } else if (tab === 'corrections') {
      steps = [
        { element: '#tour-corr-filter', popover: { title: 'Filter Corrections', description: 'Filter corrections by status to manage your backlog.', side: 'bottom' } },
        { element: '#tour-corr-list', popover: { title: 'Approve or Reject', description: 'Review why someone is requesting a time correction. Approving will permanently overwrite their punch record for that day.', side: 'top' } }
      ];
    } else if (tab === 'calendar') {
      steps = [
        { element: '#tour-cal-settings', popover: { title: 'Organisation Settings', description: 'Configure global timezone, working hours, and unpaid break limits here.', side: 'bottom' } },
        { element: '#tour-cal-holidays', popover: { title: 'Holidays', description: 'Add individual holidays or bulk upload a PDF to mark non-working days for the whole company.', side: 'top' } }
      ];
    } else if (tab === 'policy') {
      steps = [
        { element: '#tour-policy-doc', popover: { title: 'Policy Document', description: 'Upload and enforce attendance guidelines. Team members will be able to download and review this document.', side: 'bottom' } }
      ];
    } else if (tab === 'payroll') {
      steps = [
        { element: '#tour-payroll-export', popover: { title: 'Payroll Export', description: 'Generate a consolidated CSV file containing all approved leaves and total working hours, ready for your payroll provider.', side: 'bottom' } }
      ];
    } else if (tab === 'availability') {
      steps = [
        { element: '#tour-avail-calendar', popover: { title: 'Team Calendar', description: 'A consolidated view of approved leaves across the entire team to help you plan staffing.', side: 'bottom' } }
      ];
    } else if (tab === 'timing') {
      steps = [
        { element: '#tour-timing-late', popover: { title: 'Late & Overtime', description: 'Review who consistently arrives late or stays past their shift. Helps identify burnout or attendance issues.', side: 'bottom' } }
      ];`;

c = c.replace(/    } else if \(tab === 'corrections'\) \{[\s\S]*?\];\n    }/, additionalSteps);

// Inject IDs for new tabs:
// 1. OrganisationCalendarCard
c = c.replace(/function OrganisationCalendarCard[\s\S]*?<div className="grid grid-cols-1 gap-6 md:grid-cols-2">/, (match) => match.replace('<div className="grid grid-cols-1 gap-6 md:grid-cols-2">', '<div className="grid grid-cols-1 gap-6 md:grid-cols-2" id="tour-cal-settings">'));
c = c.replace(/function OrganisationCalendarCard[\s\S]*?<div className="mt-8">/, (match) => match.replace('<div className="mt-8">', '<div className="mt-8" id="tour-cal-holidays">'));

// 2. PolicyTab
c = c.replace(/function PolicyTab[\s\S]*?<Card className="p-5">/, (match) => match.replace('<Card className="p-5">', '<div id="tour-policy-doc"><Card className="p-5">'));
c = c.replace(/function PolicyTab[\s\S]*?<\/Card>/, (match) => match.replace('</Card>', '</Card></div>'));

// 3. PayrollTab
c = c.replace(/function PayrollTab[\s\S]*?<Card className="p-5">/, (match) => match.replace('<Card className="p-5">', '<div id="tour-payroll-export"><Card className="p-5">'));
c = c.replace(/function PayrollTab[\s\S]*?<\/Card>/, (match) => match.replace('</Card>', '</Card></div>'));

// 4. TeamAvailabilityTab
c = c.replace(/function TeamAvailabilityTab[\s\S]*?<Card className="p-5 overflow-hidden">/, (match) => match.replace('<Card className="p-5 overflow-hidden">', '<div id="tour-avail-calendar"><Card className="p-5 overflow-hidden">'));
c = c.replace(/function TeamAvailabilityTab[\s\S]*?<\/Card>/, (match) => match.replace('</Card>', '</Card></div>'));

// 5. TimingOverviewTab
c = c.replace(/function TimingOverviewTab[\s\S]*?<div className="space-y-4 mt-6">/, (match) => match.replace('<div className="space-y-4 mt-6">', '<div className="space-y-4 mt-6" id="tour-timing-late">'));

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Missing tabs patched!');
