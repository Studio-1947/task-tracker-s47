const fs = require('fs');
let c = fs.readFileSync('apps/web/src/pages/AttendancePage.tsx', 'utf8');

c = c.replace(/<EmptyState title="([^"]+)" description="([^"]+)"/g, '<EmptyState title="$1" hint="$2"');
c = c.replace(/<Badge color={/g, '<Badge tone={');
c = c.replace(/<ErrorState error={error} className="mb-4" \/>/g, '<div className="mb-4"><ErrorState message={error?.message || String(error)} /></div>');
c = c.replace(/variant="outline"/g, 'variant="ghost"');
c = c.replace(/loading={isPending}/g, 'disabled={isPending}');
c = c.replace(
  /<Avatar name={c\.user\?\.name \|\| '\?'} src={c\.user\?\.avatarKey \|\| undefined} size="lg" \/>/g,
  '<Avatar user={{ name: c.user?.name || \'Unknown\', avatarKey: c.user?.avatarKey }} size="lg" />'
);

fs.writeFileSync('apps/web/src/pages/AttendancePage.tsx', c);
console.log('Fixed UI props');
