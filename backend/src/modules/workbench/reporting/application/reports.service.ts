import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { safeExportText } from '../../../../shared/export/safe-export-text';
import { AuditLogService } from '../../governance/application/audit-log.service';
import { ExportReportQueryDto, ReportBucket, ReportKind, ReportQueryDto, ResourceReportQueryDto } from '../interface/http/dto/reports.dto';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
type ExportCell = string | number;
type ExportRows = ExportCell[][];

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function csvCell(value: ExportCell) {
  const text = safeExportText(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly dataScope: DataScopeService,
    private readonly requestContext: RequestContextService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async portfolio(query: ReportQueryDto) {
    const { from, endExclusive } = this.range(query);
    const scope = this.dataScope.projects(this.principal());
    const projects = await this.prisma.project.findMany({
      where: { archivedAt: null, createdAt: { lt: endExclusive }, AND: scope },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: {
        id: true, code: true, name: true, status: true, phase: true,
        milestones: { select: { status: true } },
        tasks: { where: { archivedAt: null }, select: { status: true, dueAt: true, completedAt: true } },
        risks: { where: { archivedAt: null }, select: { status: true, level: true } },
        healthSnapshots: { where: { calculatedAt: { lt: endExclusive } }, orderBy: { calculatedAt: 'desc' }, take: 1, select: { health: true } },
      },
    });
    const rows = projects.map((project) => {
      const achieved = project.milestones.filter(({ status }) => status === 'COMPLETED').length;
      const overdueTasks = project.tasks.filter((task) => task.status !== 'CANCELLED' && task.status !== 'DONE' && task.dueAt && task.dueAt < endExclusive && (!task.completedAt || task.completedAt >= endExclusive)).length;
      const highOrCriticalRisks = project.risks.filter((risk) => risk.status !== 'CLOSED' && (risk.level === 'HIGH' || risk.level === 'CRITICAL')).length;
      return {
        id: project.id, code: project.code, name: project.name, status: project.status, phase: project.phase,
        health: project.healthSnapshots[0]?.health ?? 'UNKNOWN',
        milestoneTotal: project.milestones.length,
        milestoneAchieved: achieved,
        milestonePercent: project.milestones.length ? Number((achieved / project.milestones.length * 100).toFixed(2)) : 0,
        overdueTasks,
        highOrCriticalRisks,
      };
    });
    return {
      range: { from: from.toISOString(), to: new Date(endExclusive.getTime() - DAY_MS).toISOString() },
      total: rows.length,
      byStatus: countBy(rows.map(({ status }) => status)),
      byPhase: countBy(rows.map(({ phase }) => phase)),
      byHealth: countBy(rows.map(({ health }) => health)),
      milestones: { total: rows.reduce((sum, row) => sum + row.milestoneTotal, 0), achieved: rows.reduce((sum, row) => sum + row.milestoneAchieved, 0) },
      overdueTasks: rows.reduce((sum, row) => sum + row.overdueTasks, 0),
      highOrCriticalRisks: rows.reduce((sum, row) => sum + row.highOrCriticalRisks, 0),
      rows,
    };
  }

  async taskCompletionTrend(query: ReportQueryDto) {
    const range = this.range(query);
    const scope = this.dataScope.tasks(this.principal());
    const tasks = await this.prisma.workTask.findMany({
      where: {
        archivedAt: null,
        AND: [
          { OR: [{ createdAt: { gte: range.from, lt: range.endExclusive } }, { completedAt: { gte: range.from, lt: range.endExclusive } }] },
          scope,
        ],
      },
      select: { status: true, createdAt: true, completedAt: true },
    });
    const buckets = this.emptyBuckets(range.from, range.endExclusive, range.bucket, { created: 0, completed: 0 });
    for (const task of tasks) {
      if (this.inside(task.createdAt, range)) buckets.get(this.bucketKey(task.createdAt, range.bucket))!.created += 1;
      if (task.completedAt && this.inside(task.completedAt, range)) buckets.get(this.bucketKey(task.completedAt, range.bucket))!.completed += 1;
    }
    return {
      range: this.publicRange(range),
      totalCreated: [...buckets.values()].reduce((sum, row) => sum + row.created, 0),
      totalCompleted: [...buckets.values()].reduce((sum, row) => sum + row.completed, 0),
      byStatus: countBy(tasks.map(({ status }) => status)),
      buckets: [...buckets.entries()].map(([bucket, values]) => ({ bucket, ...values })),
    };
  }

  async riskTrend(query: ReportQueryDto) {
    const range = this.range(query);
    const scope = this.dataScope.risks(this.principal());
    const risks = await this.prisma.risk.findMany({
      where: { archivedAt: null, OR: [{ createdAt: { gte: range.from, lt: range.endExclusive } }, { closedAt: { gte: range.from, lt: range.endExclusive } }], AND: scope },
      select: { status: true, level: true, createdAt: true, closedAt: true },
    });
    const buckets = this.emptyBuckets(range.from, range.endExclusive, range.bucket, { created: 0, closed: 0 });
    for (const risk of risks) {
      if (this.inside(risk.createdAt, range)) buckets.get(this.bucketKey(risk.createdAt, range.bucket))!.created += 1;
      if (risk.closedAt && this.inside(risk.closedAt, range)) buckets.get(this.bucketKey(risk.closedAt, range.bucket))!.closed += 1;
    }
    return {
      range: this.publicRange(range),
      totalCreated: [...buckets.values()].reduce((sum, row) => sum + row.created, 0),
      totalClosed: [...buckets.values()].reduce((sum, row) => sum + row.closed, 0),
      open: risks.filter(({ status }) => status !== 'CLOSED').length,
      highOrCritical: risks.filter(({ level }) => level === 'HIGH' || level === 'CRITICAL').length,
      byLevel: countBy(risks.map(({ level }) => level)),
      buckets: [...buckets.entries()].map(([bucket, values]) => ({ bucket, ...values })),
    };
  }

  async resourceLoad(query: ResourceReportQueryDto) {
    const { from, to } = this.resourceRange(query);
    const weekCount = Math.floor((to.getTime() - from.getTime()) / WEEK_MS) + 1;
    if (weekCount < 1 || weekCount > 13) this.invalidRange('Resource report range must contain between 1 and 13 weeks');
    const scope = this.dataScope.employees(this.principal());
    const resources = await this.prisma.resourceProfile.findMany({
      where: { archivedAt: null, AND: scope },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      select: { id: true, displayName: true, weeklyCapacityHours: true, loadEntries: { where: { archivedAt: null, weekStartAt: { gte: from, lte: to } }, select: { plannedHours: true, weekStartAt: true } } },
    });
    const weeks = Array.from({ length: weekCount }, (_, index) => new Date(from.getTime() + index * WEEK_MS)).map((week) => {
      const plannedHours = resources.reduce((total, resource) => total + resource.loadEntries.filter((entry) => entry.weekStartAt.getTime() === week.getTime()).reduce((sum, entry) => sum + Number(entry.plannedHours), 0), 0);
      const capacityHours = resources.reduce((total, resource) => total + resource.weeklyCapacityHours, 0);
      return { weekStartAt: week.toISOString().slice(0, 10), plannedHours: Number(plannedHours.toFixed(2)), capacityHours, utilizationPercent: this.utilization(plannedHours, capacityHours), overloaded: plannedHours > capacityHours };
    });
    const rows = resources.map((resource) => {
      const plannedHours = resource.loadEntries.reduce((sum, entry) => sum + Number(entry.plannedHours), 0);
      const capacityHours = resource.weeklyCapacityHours * weekCount;
      const hoursByWeek = resource.loadEntries.reduce<Map<number, number>>((totals, entry) => {
        const key = entry.weekStartAt.getTime();
        totals.set(key, (totals.get(key) ?? 0) + Number(entry.plannedHours));
        return totals;
      }, new Map());
      return { id: resource.id, displayName: resource.displayName, plannedHours: Number(plannedHours.toFixed(2)), capacityHours, utilizationPercent: this.utilization(plannedHours, capacityHours), overloaded: [...hoursByWeek.values()].some((hours) => hours > resource.weeklyCapacityHours) };
    });
    const plannedHours = weeks.reduce((sum, week) => sum + week.plannedHours, 0);
    const capacityHours = weeks.reduce((sum, week) => sum + week.capacityHours, 0);
    return { fromWeek: from.toISOString().slice(0, 10), toWeek: to.toISOString().slice(0, 10), resourceCount: resources.length, plannedHours: Number(plannedHours.toFixed(2)), capacityHours, utilizationPercent: this.utilization(plannedHours, capacityHours), overloadedResources: rows.filter(({ overloaded }) => overloaded).length, weeks, rows };
  }

  async intelligence(query: ReportQueryDto) {
    const range = this.range(query);
    const scope = this.dataScope.intelligenceItems(this.principal());
    const items = await this.prisma.intelligenceItem.findMany({
      where: { archivedAt: null, createdAt: { gte: range.from, lt: range.endExclusive }, AND: scope },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, status: true, priority: true, createdAt: true, topics: { select: { topic: { select: { name: true } } } }, occurrences: { select: { source: { select: { name: true } } } }, conversions: { select: { kind: true } } },
    });
    const buckets = this.emptyBuckets(range.from, range.endExclusive, range.bucket, { created: 0 });
    items.forEach((item) => { buckets.get(this.bucketKey(item.createdAt, range.bucket))!.created += 1; });
    return {
      range: this.publicRange(range), total: items.length,
      byTopic: countBy(items.flatMap((item) => item.topics.map(({ topic }) => topic.name))),
      bySource: countBy(items.flatMap((item) => [...new Set(item.occurrences.map(({ source }) => source.name))])),
      byPriority: countBy(items.map(({ priority }) => priority)),
      byConversionKind: countBy(items.flatMap((item) => item.conversions.map(({ kind }) => kind))),
      buckets: [...buckets.entries()].map(([bucket, values]) => ({ bucket, ...values })),
      rows: items.map((item) => ({ id: item.id, title: item.title, status: item.status, priority: item.priority, topics: item.topics.map(({ topic }) => topic.name), sources: [...new Set(item.occurrences.map(({ source }) => source.name))], conversions: item.conversions.map(({ kind }) => kind) })),
    };
  }

  async summary(query: ReportQueryDto) {
    const resourceFrom = this.weekStart(new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`)).toISOString().slice(0, 10);
    const resourceTo = this.weekStart(new Date(`${query.to.slice(0, 10)}T00:00:00.000Z`)).toISOString().slice(0, 10);
    const [portfolio, tasks, risks, resources, intelligence] = await Promise.all([this.portfolio(query), this.taskCompletionTrend(query), this.riskTrend(query), this.resourceLoad({ fromWeek: resourceFrom, toWeek: resourceTo }), this.intelligence(query)]);
    return { portfolio, tasks, risks, resources, intelligence };
  }

  async exportReport(query: ExportReportQueryDto): Promise<{ content: Buffer; contentType: string; extension: 'csv' | 'xlsx' }> {
    try {
      const rows = await this.exportRows(query.kind, query);
      const result = query.format === 'CSV' ? this.csv(rows) : await this.xlsx(rows, query.kind);
      await this.recordExport(query, rows.length - 1, 'SUCCEEDED');
      return result;
    } catch (error) {
      await this.recordExport(query, 0, 'FAILED').catch(() => undefined);
      throw error;
    }
  }

  private async exportRows(kind: ReportKind, query: ReportQueryDto): Promise<ExportRows> {
    if (kind === 'PORTFOLIO') {
      const data = await this.portfolio(query);
      return [['项目编码', '项目名称', '状态', '阶段', '健康度', '里程碑达成率', '逾期任务', '高/严重风险'], ...data.rows.map((row) => [row.code, row.name, row.status, row.phase, row.health, `${row.milestonePercent}%`, row.overdueTasks, row.highOrCriticalRisks])];
    }
    if (kind === 'TASKS') {
      const data = await this.taskCompletionTrend(query);
      return [['周期', '新建任务', '完成任务'], ...data.buckets.map((row) => [row.bucket, row.created, row.completed])];
    }
    if (kind === 'RISKS') {
      const data = await this.riskTrend(query);
      return [['周期', '新增风险', '关闭风险'], ...data.buckets.map((row) => [row.bucket, row.created, row.closed])];
    }
    if (kind === 'RESOURCES') {
      const data = await this.resourceLoad({ fromWeek: this.weekStart(new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`)).toISOString().slice(0, 10), toWeek: this.weekStart(new Date(`${query.to.slice(0, 10)}T00:00:00.000Z`)).toISOString().slice(0, 10) });
      return [['周期', '计划工时', '容量工时', '利用率', '是否超载'], ...data.weeks.map((row) => [row.weekStartAt, row.plannedHours, row.capacityHours, row.utilizationPercent === null ? '不可计算' : `${row.utilizationPercent}%`, row.overloaded ? '是' : '否'])];
    }
    const data = await this.intelligence(query);
    return [['情报标题', '状态', '优先级', '主题', '来源', '转换'], ...data.rows.map((row) => [row.title, row.status, row.priority, row.topics.join(' / '), row.sources.join(' / '), row.conversions.join(' / ')])];
  }

  private csv(rows: ExportRows) {
    return { content: Buffer.from(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8'), contentType: 'text/csv; charset=utf-8', extension: 'csv' as const };
  }

  private async xlsx(rows: ExportRows, kind: ReportKind) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RD Manager Workbench';
    const sheet = workbook.addWorksheet(kind, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => { column.width = 18; });
    return { content: Buffer.from(await workbook.xlsx.writeBuffer()), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' as const };
  }

  private recordExport(query: ExportReportQueryDto, itemCount: number, outcome: 'SUCCEEDED' | 'FAILED') {
    if (!this.audit) return Promise.resolve();
    return this.audit.record({ action: 'REPORT_EXPORT', entityType: 'report', entityId: query.kind, outcome, changedFields: [], metadata: { objectType: query.kind, status: query.format, itemCount } }).then(() => undefined);
  }

  private range(query: ReportQueryDto) {
    const sourceFrom = query.from.slice(0, 10);
    const sourceTo = query.to.slice(0, 10);
    const from = new Date(`${sourceFrom}T00:00:00.000Z`);
    const to = new Date(`${sourceTo}T00:00:00.000Z`);
    const days = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (!Number.isFinite(days) || sourceFrom !== from.toISOString().slice(0, 10) || sourceTo !== to.toISOString().slice(0, 10) || days < 1 || days > 366) this.invalidRange('Report range must contain between 1 and 366 valid calendar days');
    return { from, to, endExclusive: new Date(to.getTime() + DAY_MS), bucket: query.bucket ?? 'WEEK' as ReportBucket };
  }

  private invalidRange(message: string): never {
    throw new AppError({ code: ErrorCodes.REPORT_RANGE_INVALID, message, statusCode: HttpStatus.UNPROCESSABLE_ENTITY });
  }

  private utcMonday(value: string) {
    const source = value.slice(0, 10);
    const date = new Date(`${source}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || source !== date.toISOString().slice(0, 10) || date.getUTCDay() !== 1) this.invalidRange('Resource report weeks must be valid UTC Mondays');
    return date;
  }

  private resourceRange(query: ResourceReportQueryDto) {
    if (query.from !== undefined || query.to !== undefined) {
      if (!query.from || !query.to || query.fromWeek || query.toWeek) {
        this.invalidRange('Resource report requires one complete date range');
      }
      const range = this.range({ from: query.from, to: query.to, bucket: query.bucket });
      return {
        from: this.weekStart(range.from),
        to: this.weekStart(range.to),
      };
    }
    if (!query.fromWeek || !query.toWeek) {
      this.invalidRange('Resource report requires from/to or fromWeek/toWeek');
    }
    return {
      from: this.utcMonday(query.fromWeek),
      to: this.utcMonday(query.toWeek),
    };
  }

  private publicRange(range: ReturnType<ReportsService['range']>) { return { from: range.from.toISOString(), to: range.to.toISOString(), bucket: range.bucket }; }
  private inside(date: Date, range: ReturnType<ReportsService['range']>) { return date >= range.from && date < range.endExclusive; }
  private utilization(plannedHours: number, capacityHours: number) { return capacityHours ? Number((plannedHours / capacityHours * 100).toFixed(2)) : plannedHours > 0 ? null : 0; }

  private emptyBuckets<T extends Record<string, number>>(from: Date, endExclusive: Date, bucket: ReportBucket, initial: T) {
    const result = new Map<string, T>();
    let cursor = bucket === 'WEEK' ? this.weekStart(from) : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (cursor < endExclusive) {
      result.set(this.bucketKey(cursor, bucket), { ...initial });
      cursor = bucket === 'WEEK' ? new Date(cursor.getTime() + WEEK_MS) : new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return result;
  }

  private bucketKey(date: Date, bucket: ReportBucket) { return bucket === 'MONTH' ? date.toISOString().slice(0, 7) : this.weekStart(date).toISOString().slice(0, 10); }
  private weekStart(date: Date) { const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); const day = monday.getUTCDay() || 7; monday.setUTCDate(monday.getUTCDate() - day + 1); return monday; }
}
