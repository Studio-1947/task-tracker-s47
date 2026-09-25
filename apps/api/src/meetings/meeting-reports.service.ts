import { Inject, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';
import { meetingBoardItems, meetingBoards, projects, users } from '../database/schema';

type Card = { week: string; day: string; slot: string; title: string; person: string; project: string; status: string; rolledOver: boolean; completedAt: Date | null };
const csv = (v: string | number | boolean | null) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const cut = (v: string, n: number) => v.length > n ? `${v.slice(0, n - 1)}…` : v;

@Injectable()
export class MeetingReportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private range(month: string) {
    const [year, number] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, number - 1, 1));
    const end = new Date(Date.UTC(year, number, 1));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }

  private async report(month: string) {
    const { start, end, label } = this.range(month);
    const rows = await this.db.select({ week: meetingBoards.weekStart, day: meetingBoardItems.dayDate, slot: meetingBoardItems.slot, title: meetingBoardItems.title, person: users.name, project: projects.name, status: meetingBoardItems.status, rolledOver: meetingBoardItems.rolledOver, completedAt: meetingBoardItems.completedAt })
      .from(meetingBoardItems).innerJoin(meetingBoards, eq(meetingBoards.id, meetingBoardItems.boardId)).innerJoin(users, eq(users.id, meetingBoardItems.userId)).leftJoin(projects, eq(projects.id, meetingBoardItems.projectId))
      .where(and(gte(meetingBoards.weekStart, start), lt(meetingBoards.weekStart, end))).orderBy(asc(meetingBoards.weekStart), asc(meetingBoardItems.dayDate), asc(meetingBoardItems.position));
    const cards: Card[] = rows.map((r) => ({ ...r, week: r.week, day: r.day, project: r.project ?? 'Unfiled', status: r.status, slot: r.slot, rolledOver: r.rolledOver, completedAt: r.completedAt }));
    const done = cards.filter((c) => c.status === 'DONE').length;
    const carryOvers = cards.filter((c) => c.rolledOver).length;
    const aggregate = (key: (card: Card) => string) => [...cards.reduce((map, c) => { const label = key(c); const v = map.get(label) ?? { name: label, cards: 0, done: 0, carryOvers: 0 }; v.cards++; if (c.status === 'DONE') v.done++; if (c.rolledOver) v.carryOvers++; map.set(label, v); return map; }, new Map<string, { name: string; cards: number; done: number; carryOvers: number }>()).values()].sort((a, b) => b.done - a.done || b.cards - a.cards || a.name.localeCompare(b.name));
    return { label, cards, total: cards.length, done, carryOvers, completionRate: cards.length ? Math.round(done / cards.length * 100) : 0, pending: cards.filter((c) => c.status === 'PENDING').length, inProgress: cards.filter((c) => c.status === 'IN_PROGRESS').length, people: aggregate((c) => c.person), projects: aggregate((c) => c.project) };
  }

  async csv(month: string) {
    const r = await this.report(month);
    const lines = [ ['Meetings Monthly Report', r.label], ['Planned cards', r.total], ['Completed', r.done], ['Completion rate', `${r.completionRate}%`], ['Carry-overs', r.carryOvers], [], ['Week', 'Day', 'Half', 'Card', 'Owner', 'Project', 'Status', 'Carried over', 'Completed at'], ...r.cards.map((c) => [c.week, c.day, c.slot, c.title, c.person, c.project, c.status, c.rolledOver ? 'Yes' : 'No', c.completedAt?.toISOString() ?? '']) ];
    return Buffer.from(`\uFEFF${lines.map((line) => line.map(csv).join(',')).join('\r\n')}`, 'utf8');
  }

  async pdf(month: string): Promise<Buffer> {
    const r = await this.report(month);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: `Meeting report - ${r.label}`, Author: 'Task Tracker' } }); const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const section = (title: string) => { if (doc.y > bottom() - 90) doc.addPage(); doc.x = 42; doc.moveDown(1).font('Helvetica-Bold').fontSize(13).fillColor('#1e293b').text(title).moveDown(.4); };
      const header = (cols: { text: string; x: number; width: number }[]) => { doc.x = 42; doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569'); cols.forEach((c) => doc.text(c.text, c.x, doc.y, { width: c.width })); doc.moveDown(.45).strokeColor('#cbd5e1').moveTo(42, doc.y).lineTo(553, doc.y).stroke().moveDown(.35); };
      const pie = (x: number, y: number, radius: number, values: { label: string; value: number; color: string }[]) => {
        const total = values.reduce((sum, item) => sum + item.value, 0);
        if (!total) { doc.circle(x, y, radius).fill('#dbeafe'); doc.fillColor('#64748b').font('Helvetica').fontSize(7).text('No cards', x - radius, y - 3, { width: radius * 2, align: 'center' }); return; }
        let angle = -90;
        values.forEach((item) => { if (item.value) { const next = angle + item.value / total * 360; const points = Math.max(2, Math.ceil((next - angle) / 8)); doc.moveTo(x, y); for (let point = 0; point <= points; point += 1) { const radians = (angle + (next - angle) * point / points) * Math.PI / 180; doc.lineTo(x + Math.cos(radians) * radius, y + Math.sin(radians) * radius); } doc.lineTo(x, y).fill(item.color); angle = next; } });
        doc.circle(x, y, radius * .55).fill('#fff'); doc.fillColor('#134e4a').font('Helvetica-Bold').fontSize(13).text(String(total), x - radius * .55, y - 9, { width: radius * 1.1, align: 'center' }); doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text('cards', x - radius * .55, y + 6, { width: radius * 1.1, align: 'center' });
      };
      const legend = (x: number, y: number, values: { label: string; value: number; color: string }[]) => values.forEach((item, index) => { const top = y + index * 19; doc.roundedRect(x, top, 8, 8, 2).fill(item.color); doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text(`${item.label}  ${item.value}`, x + 13, top - 1, { width: 108 }); });
      doc.rect(0, 0, doc.page.width, 108).fill('#0f766e'); doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('Meetings Monthly Report', 42, 34); doc.font('Helvetica').fontSize(11).fillColor('#ccfbf1').text(r.label, 42, 64); doc.fontSize(8).text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, 42, 83); doc.y = 132;
      [['Planned cards', r.total], ['Completed', r.done], ['Completion rate', `${r.completionRate}%`], ['Carry-overs', r.carryOvers]].forEach(([label, value], i) => { const x = 42 + i * 128; doc.roundedRect(x, 132, 116, 58, 7).fillAndStroke('#f8fafc', '#e2e8f0'); doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(String(label), x + 10, 143, { width: 96 }); doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(18).text(String(value), x + 10, 158, { width: 96 }); }); doc.y = 202;
      section('Visual analytics'); const statuses = [{ label: 'Pending', value: r.pending, color: '#94a3b8' }, { label: 'In progress', value: r.inProgress, color: '#f59e0b' }, { label: 'Done', value: r.done, color: '#14b8a6' }]; pie(105, doc.y + 55, 42, statuses); legend(163, doc.y + 25, statuses);
      const chartX = 310; const chartY = doc.y + 18; const width = 212;
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5).text('Meeting completion', chartX, chartY); doc.roundedRect(chartX, chartY + 17, width, 13, 6).fill('#ccfbf1'); doc.roundedRect(chartX, chartY + 17, width * Math.min(r.completionRate, 100) / 100, 13, 6).fill('#0f766e'); doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(11).text(`${r.completionRate}%`, chartX, chartY + 38); doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(`${r.done} completed  |  ${r.carryOvers} carry-overs`, chartX + 37, chartY + 41);
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5).text('Project load', chartX, chartY + 67); const topProjects = r.projects.slice(0, 3); const maxProject = Math.max(1, ...topProjects.map((row) => row.cards)); (topProjects.length ? topProjects : [{ name: 'No project activity', cards: 0, done: 0, carryOvers: 0 }]).forEach((row, index) => { const y = chartY + 83 + index * 17; doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(cut(row.name, 18), chartX, y, { width: 92 }); doc.roundedRect(chartX + 96, y + 1, 105, 7, 3).fill('#ccfbf1'); if (row.cards) doc.roundedRect(chartX + 96, y + 1, 105 * row.cards / maxProject, 7, 3).fill('#14b8a6'); doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7).text(String(row.cards), chartX + 205, y, { width: 18, align: 'right' }); }); doc.x = 42; doc.y = 392;
      section('Deep analysis'); const narrative = r.total === 0 ? `No meeting cards were scheduled on boards starting in ${r.label}.` : `${r.done} of ${r.total} planned cards were completed (${r.completionRate}%). ${r.inProgress} cards were in progress and ${r.pending} remained pending. ${r.carryOvers} cards began as carry-overs, highlighting work that flowed between weekly meetings.`; doc.font('Helvetica').fontSize(10).fillColor('#334155').text(narrative, { lineGap: 3 });
      const performance = (title: string, rows: { name: string; cards: number; done: number; carryOvers: number }[]) => { section(title); const cols = [{ text: title === 'Team contribution' ? 'Person' : 'Project', x: 42, width: 300 }, { text: 'Cards', x: 350, width: 60 }, { text: 'Done', x: 418, width: 60 }, { text: 'Carry-over', x: 486, width: 60 }]; header(cols); (rows.length ? rows : [{ name: 'No data', cards: 0, done: 0, carryOvers: 0 }]).forEach((row) => { if (doc.y > bottom() - 34) { doc.addPage(); header(cols); } const y = doc.y; doc.font('Helvetica').fontSize(8.5).fillColor('#334155'); doc.text(cut(row.name, 52), 42, y, { width: 300 }); doc.text(String(row.cards), 350, y, { width: 60 }); doc.text(String(row.done), 418, y, { width: 60 }); doc.text(String(row.carryOvers), 486, y, { width: 60 }); doc.moveDown(.6); }); };
      performance('Team contribution', r.people); performance('Project delivery', r.projects);
      section('Meeting card activity'); const cols = [{ text: 'Week', x: 42, width: 60 }, { text: 'Card', x: 107, width: 210 }, { text: 'Owner', x: 322, width: 95 }, { text: 'Status', x: 422, width: 65 }, { text: 'Carry', x: 492, width: 50 }]; header(cols); r.cards.forEach((c) => { if (doc.y > bottom() - 40) { doc.addPage(); header(cols); } const y = doc.y; doc.font('Helvetica').fontSize(7.5).fillColor('#334155'); doc.text(c.week, 42, y, { width: 60 }); doc.text(cut(c.title, 75), 107, y, { width: 210, height: 24 }); doc.text(cut(c.person, 20), 322, y, { width: 95 }); doc.text(c.status.replace('_', ' '), 422, y, { width: 65 }); doc.text(c.rolledOver ? 'Yes' : '-', 492, y, { width: 50 }); doc.moveDown(1.7); });
      const pages = doc.bufferedPageRange(); for (let i = 0; i < pages.count; i++) { doc.switchToPage(i); doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(`Task Tracker | Meetings | ${r.label} | Page ${i + 1} of ${pages.count}`, 42, 784, { width: 511, align: 'center' }); } doc.end();
    });
  }
}
