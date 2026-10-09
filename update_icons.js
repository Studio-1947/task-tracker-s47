const fs = require('fs');
let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

c = c.replace(/>Default<\/label>/g, '>Default <span className="cursor-help opacity-70">ⓘ</span></label>');
c = c.replace(/>Accrual<\/label>/g, '>Accrual <span className="cursor-help opacity-70">ⓘ</span></label>');
c = c.replace(/>Carry max<\/label>/g, '>Carry max <span className="cursor-help opacity-70">ⓘ</span></label>');
c = c.replace(/>Expire\(mo\)<\/label>/g, '>Expire(mo) <span className="cursor-help opacity-70">ⓘ</span></label>');
c = c.replace(/>Carry Policy<\/label>/g, '>Carry Policy <span className="cursor-help opacity-70">ⓘ</span></label>');

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Icons added!');
