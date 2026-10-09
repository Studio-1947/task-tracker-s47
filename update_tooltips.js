const fs = require('fs');
let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

c = c.replace(/<label(.*?)>Default<\/label>/g, '<label$1 title="Fixed number of days granted per year if no monthly accrual is set">Default</label>');
c = c.replace(/<label(.*?)>Accrual<\/label>/g, '<label$1 title="Days automatically credited on the 1st of each month (0 = fixed yearly days)">Accrual</label>');
c = c.replace(/<label(.*?)>Carry max<\/label>/g, '<label$1 title="Maximum number of unused days that can roll over into the next year">Carry max</label>');
c = c.replace(/<label(.*?)>Expire\(mo\)<\/label>/g, '<label$1 title="How many months into the new year before carried-over days expire (blank = never)">Expire(mo)</label>');
c = c.replace(/<label(.*?)>Carry Policy<\/label>/g, '<label$1 title="Lapse: Rolls over up to \'Carry max\'. Carry All: Entire balance rolls over. No Carry: Resets to 0.">Carry Policy</label>');
c = c.replace(/<label(.*?)>WFH Days<\/label>/g, '<label$1 title="Reference figure only: work-from-home days are not formally tracked or deducted">WFH Days</label>');

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Tooltips added successfully!');
