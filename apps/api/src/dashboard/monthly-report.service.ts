import { Inject, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { and, asc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../database/database.module';
import { projects, taskAssignees, tasks, users, workspaces } from '../database/schema';

type MonthlyTaskRow = {
  ref: string;
  title: string;
  workspace: string;
  project: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  assignees: string;
};

type MonthlyReport = {
  month: string;
  label: string;
  created: number;
  completed: number;
  openAtMonthEnd: number;
  overdueAtMonthEnd: number;
  completionRate: number;
  statusCounts: Record<string, number>;
  workspaceRows: { name: string; created: number; completed: number; overdue: number; completionRate: number }[];
  assigneeRows: { name: string; assigned: number; completed: number }[];
  tasks: MonthlyTaskRow[];
};

const csvCell = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const dateCell = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : '');
const truncate = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

@Injectable()
export class MonthlyReportService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private range(month: string) {
    const [year, monthNumber] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    return { start, end, label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }

  private async data(month: string): Promise<MonthlyReport> {
    const { start, end, label } = this.range(month);
    const activeInMonth = or(
      and(gte(tasks.createdAt, start), lt(tasks.createdAt, end)),
      and(gte(tasks.completedAt, start), lt(tasks.completedAt, end)),
    );
    const rows = await this.db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        createdAt: tasks.createdAt,
        completedAt: tasks.completedAt,
        workspace: workspaces.name,
        project: projects.name,
        prefix: projects.taskPrefix,
      })
      .from(tasks)
      .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(activeInMonth)
      .orderBy(asc(workspaces.name), asc(projects.name), asc(tasks.number));

    const ids = rows.map((row) => row.id);
    const assigneeRows = ids.length
      ? await this.db
          .select({ taskId: taskAssignees.taskId, name: users.name })
          .from(taskAssignees)
          .innerJoin(users, eq(users.id, taskAssignees.userId))
          .where(inArray(taskAssignees.taskId, ids))
          .orderBy(asc(users.name))
      : [];
    const assigneesByTask = new Map<string, string[]>();
    for (const row of assigneeRows) assigneesByTask.set(row.taskId, [...(assigneesByTask.get(row.taskId) ?? []), row.name]);

    const monthTasks = rows.map<MonthlyTaskRow>((row) => ({
      ref: `${row.prefix}-${row.number}`,
      title: row.title,
      workspace: row.workspace,
      project: row.project,
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      assignees: (assigneesByTask.get(row.id) ?? []).join(', '),
    }));
    const created = rows.filter((row) => row.createdAt >= start && row.createdAt < end).length;
    const completed = rows.filter((row) => row.completedAt && row.completedAt >= start && row.completedAt < end).length;
    const overdueAtMonthEnd = rows.filter((row) => row.dueDate && row.dueDate < end && (!row.completedAt || row.completedAt >= end)).length;
    const openAtMonthEnd = rows.filter((row) => row.createdAt < end && (!row.completedAt || row.completedAt >= end)).length;
    const statusCounts = Object.fromEntries(['TODO', 'IN_PROGRESS', 'DONE'].map((status) => [status, 0])) as Record<string, number>;
    for (const row of rows) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;

    const workspaceMap = new Map<string, { created: number; completed: number; overdue: number }>();
    for (const row of rows) {
      const current = workspaceMap.get(row.workspace) ?? { created: 0, completed: 0, overdue: 0 };
      if (row.createdAt >= start && row.createdAt < end) current.created += 1;
      if (row.completedAt && row.completedAt >= start && row.completedAt < end) current.completed += 1;
      if (row.dueDate && row.dueDate < end && (!row.completedAt || row.completedAt >= end)) current.overdue += 1;
      workspaceMap.set(row.workspace, current);
    }
    const workspaceRows = [...workspaceMap.entries()]
      .map(([name, values]) => ({ ...values, name, completionRate: values.created ? Math.round((values.completed / values.created) * 100) : 0 }))
      .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));

    const assigneeMap = new Map<string, { assigned: number; completed: number }>();
    for (const row of rows) {
      for (const name of assigneesByTask.get(row.id) ?? []) {
        const current = assigneeMap.get(name) ?? { assigned: 0, completed: 0 };
        current.assigned += 1;
        if (row.completedAt && row.completedAt >= start && row.completedAt < end) current.completed += 1;
        assigneeMap.set(name, current);
      }
    }
    const assigneeRowsSummary = [...assigneeMap.entries()]
      .map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.completed - a.completed || b.assigned - a.assigned || a.name.localeCompare(b.name));

    return {
      month,
      label,
      created,
      completed,
      openAtMonthEnd,
      overdueAtMonthEnd,
      completionRate: created ? Math.round((completed / created) * 100) : 0,
      statusCounts,
      workspaceRows,
      assigneeRows: assigneeRowsSummary,
      tasks: monthTasks,
    };
  }

  async csv(month: string): Promise<Buffer> {
    const report = await this.data(month);
    const lines = [
      ['Monthly Task Report', report.label],
      ['Created', report.created],
      ['Completed', report.completed],
      ['Completion rate', `${report.completionRate}%`],
      ['Open at month end', report.openAtMonthEnd],
      ['Overdue at month end', report.overdueAtMonthEnd],
      [],
      ['Task ref', 'Title', 'Workspace', 'Project', 'Status', 'Priority', 'Assignees', 'Due date', 'Created', 'Completed'],
      ...report.tasks.map((task) => [task.ref, task.title, task.workspace, task.project, task.status, task.priority, task.assignees, dateCell(task.dueDate), dateCell(task.createdAt), dateCell(task.completedAt)]),
    ].map((row) => row.map(csvCell).join(','));
    return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
  }

  async pdf(month: string): Promise<Buffer> {
    const report = await this.data(month);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true, info: { Title: `Monthly report - ${report.label}`, Author: 'Task Tracker' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageBottom = () => doc.page.height - doc.page.margins.bottom;
      const heading = (title: string) => {
        if (doc.y > pageBottom() - 100) doc.addPage();
        doc.moveDown(1).fontSize(13).fillColor('#1e293b').font('Helvetica-Bold').text(title).moveDown(0.45);
      };
      const tableHeader = (columns: { label: string; x: number; width: number }[]) => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569');
        for (const column of columns) doc.text(column.label, column.x, doc.y, { width: column.width });
        doc.moveDown(0.45).strokeColor('#cbd5e1').moveTo(42, doc.y).lineTo(553, doc.y).stroke().moveDown(0.35);
      };

      doc.rect(0, 0, doc.page.width, 108).fill('#312e81');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Monthly Operations Report', 42, 34);
      doc.font('Helvetica').fontSize(11).fillColor('#c7d2fe').text(report.label, 42, 64);
      doc.fontSize(8).text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 42, 83);
      doc.y = 132;

      const cards = [
        ['Created', String(report.created)], ['Completed', String(report.completed)], ['Completion rate', `${report.completionRate}%`], ['Overdue at month end', String(report.overdueAtMonthEnd)],
      ];
      cards.forEach(([label, value], index) => {
        const x = 42 + index * 128;
        doc.roundedRect(x, 132, 116, 58, 7).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(label, x + 10, 143, { width: 96 });
        doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(18).text(value, x + 10, 158, { width: 96 });
      });
      doc.y = 202;
      heading('Executive analysis');
      const summary = report.created === 0
        ? `No tasks were created in ${report.label}. ${report.completed} tasks were completed from existing work.`
        : `${report.completed} of ${report.created} newly created tasks were completed (${report.completionRate}%). ${report.openAtMonthEnd} tasks remained open at month end, including ${report.overdueAtMonthEnd} overdue tasks.`;
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(summary, { lineGap: 3 });
      doc.moveDown(0.4).fontSize(9).text(`Status across monthly activity: To do ${report.statusCounts.TODO ?? 0} | In progress ${report.statusCounts.IN_PROGRESS ?? 0} | Done ${report.statusCounts.DONE ?? 0}`);

      heading('Workspace performance');
      const workspaceColumns = [{ label: 'Workspace', x: 42, width: 230 }, { label: 'Created', x: 280, width: 58 }, { label: 'Completed', x: 346, width: 70 }, { label: 'Overdue', x: 424, width: 58 }, { label: 'Rate', x: 490, width: 55 }];
      tableHeader(workspaceColumns);
      report.workspaceRows.forEach((row) => {
        if (doc.y > pageBottom() - 34) { doc.addPage(); tableHeader(workspaceColumns); }
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
        doc.text(truncate(row.name, 42), 42, doc.y, { width: 230 });
        doc.text(String(row.created), 280, doc.y, { width: 58 }); doc.text(String(row.completed), 346, doc.y, { width: 70 });
        doc.text(String(row.overdue), 424, doc.y, { width: 58 }); doc.text(`${row.completionRate}%`, 490, doc.y, { width: 55 }); doc.moveDown(0.6);
      });

      heading('Team contribution');
      const personColumns = [{ label: 'Person', x: 42, width: 320 }, { label: 'Tagged tasks', x: 370, width: 90 }, { label: 'Completed', x: 468, width: 76 }];
      tableHeader(personColumns);
      (report.assigneeRows.length ? report.assigneeRows : [{ name: 'No people tagged on monthly tasks', assigned: 0, completed: 0 }]).forEach((row) => {
        if (doc.y > pageBottom() - 34) { doc.addPage(); tableHeader(personColumns); }
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
        doc.text(truncate(row.name, 58), 42, doc.y, { width: 320 }); doc.text(String(row.assigned), 370, doc.y, { width: 90 }); doc.text(String(row.completed), 468, doc.y, { width: 76 }); doc.moveDown(0.6);
      });

      heading('Task activity');
      const taskColumns = [{ label: 'Ref', x: 42, width: 52 }, { label: 'Task', x: 100, width: 185 }, { label: 'Workspace', x: 290, width: 95 }, { label: 'Status', x: 390, width: 70 }, { label: 'Due', x: 466, width: 78 }];
      tableHeader(taskColumns);
      report.tasks.forEach((task) => {
        if (doc.y > pageBottom() - 42) { doc.addPage(); tableHeader(taskColumns); }
        const y = doc.y;
        doc.font('Helvetica').fontSize(7.5).fillColor('#334155');
        doc.text(task.ref, 42, y, { width: 52 }); doc.text(truncate(task.title, 70), 100, y, { width: 185, height: 24 });
        doc.text(truncate(task.workspace, 24), 290, y, { width: 95 }); doc.text(task.status.replace('_', ' '), 390, y, { width: 70 }); doc.text(dateCell(task.dueDate) || '-', 466, y, { width: 78 }); doc.moveDown(1.7);
      });

      const pages = doc.bufferedPageRange();
      for (let index = 0; index < pages.count; index += 1) {
        doc.switchToPage(index);
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8').text(`Task Tracker | ${report.label} | Page ${index + 1} of ${pages.count}`, 42, 784, { width: 511, align: 'center' });
      }
      doc.end();
    });
  }
}
