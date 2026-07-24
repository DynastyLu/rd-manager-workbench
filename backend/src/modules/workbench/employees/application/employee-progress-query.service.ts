import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EmployeeImportRowStatus,
  EmployeeProgressPeriod,
  EmployeeWorkImportBatch,
  EmployeeWorkImportStatus,
  EmployeeWorkStatus,
  Prisma,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { isEmployeeImportBatchExpired } from './employee-import-lifecycle';

const DAY_MS = 86_400_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RISK_SUMMARY_LIMIT = 20;
const GROUP_SUMMARY_LIMIT = 100;
const DETAIL_SUMMARY_LIMIT = 10;
const QUERY_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 30_000,
  timeout: 120_000,
} as const;

export interface EmployeeProgressQuery {
  periodType: EmployeeProgressPeriod;
  periodStart: string;
  department?: string;
  projectId?: string;
  status?: EmployeeWorkStatus;
}

export interface EmployeeWorkItemsQuery extends EmployeeProgressQuery {
  employeeId?: string;
  page?: number;
  pageSize?: number;
}

export interface EmployeeImportHistoryQuery {
  periodType?: EmployeeProgressPeriod;
  periodStart?: string;
  status?: EmployeeWorkImportStatus;
  page?: number;
  pageSize?: number;
}

export interface EmployeeImportDetailQuery {
  rowsPage?: number;
  rowsPageSize?: number;
  rowStatus?: EmployeeImportRowStatus;
  issuesOnly?: boolean;
}

const WORK_ITEM_SELECT = {
  id: true,
  employeeId: true,
  importBatchId: true,
  sourceRowId: true,
  periodStartAt: true,
  periodEndAt: true,
  title: true,
  planText: true,
  summaryText: true,
  completionRate: true,
  status: true,
  nextPlanText: true,
  riskText: true,
  plannedHours: true,
  actualHours: true,
  projectId: true,
  taskId: true,
  riskId: true,
  note: true,
  employee: {
    select: { id: true, displayName: true, department: true, roleTitle: true },
  },
  project: { select: { id: true, code: true, name: true, archivedAt: true } },
  task: { select: { id: true, code: true, title: true, archivedAt: true } },
  importBatch: { select: { id: true, version: true, status: true } },
  sourceRow: { select: { rowNumber: true } },
} as const satisfies Prisma.EmployeeWorkItemSelect;

type QueryWorkItem = Prisma.EmployeeWorkItemGetPayload<{
  select: {
    id: true;
    employeeId: true;
    importBatchId: true;
    sourceRowId: true;
    periodStartAt: true;
    periodEndAt: true;
    title: true;
    planText: true;
    summaryText: true;
    completionRate: true;
    status: true;
    nextPlanText: true;
    riskText: true;
    plannedHours: true;
    actualHours: true;
    projectId: true;
    taskId: true;
    riskId: true;
    note: true;
    employee: {
      select: { id: true; displayName: true; department: true; roleTitle: true };
    };
    project: { select: { id: true; code: true; name: true; archivedAt: true } };
    task: { select: { id: true; code: true; title: true; archivedAt: true } };
    importBatch: { select: { id: true; version: true; status: true } };
    sourceRow: { select: { rowNumber: true } };
  };
}>;

interface PeriodBounds {
  type: EmployeeProgressPeriod;
  startAt: Date;
  endAt: Date;
  start: string;
  end: string;
}

interface ProgressMetrics {
  workItemCount: number;
  completedCount: number;
  completionRate: number | null;
  averageCompletionRate: number | null;
  plannedHours: number;
  actualHours: number;
  riskCount: number;
  blockedCount: number;
  projectCount: number;
  unlinkedCount: number;
  dataComplete: boolean;
  missingWeeks: string[];
}

interface RawMetricsRow {
  workItemCount: number | bigint;
  completedCount: number | bigint;
  averageCompletionRate: number | null;
  plannedHours: number | null;
  actualHours: number | null;
  riskCount: number | bigint;
  blockedCount: number | bigint;
  projectCount: number | bigint;
  unlinkedCount: number | bigint;
}

interface RawEmployeeSummaryRow extends RawMetricsRow {
  employeeId: string;
  displayName: string;
  department: string | null;
  roleTitle: string | null;
  sourceBatchIds: string[];
  total: number | bigint;
}

interface RawProjectSummaryRow extends RawMetricsRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  archived: boolean;
  participantCount: number | bigint;
  sourceBatchIds: string[];
  total: number | bigint;
}

interface RawEmployeeDetailRow {
  employeeId: string;
  workItemId: string;
  text: string | null;
  total: number | bigint;
}

@Injectable()
export class EmployeeProgressQueryService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
  ) {}

  async team(query: EmployeeProgressQuery) {
    return this.prisma.$transaction(async (tx) => {
      const period = this.periodBounds(query.periodType, query.periodStart);
      const sqlWhere = this.dashboardSqlWhere(query, period);
      const [facts, employeeRows, projectRows] = await Promise.all([
        this.dashboardFactsFrom(tx, query, period, sqlWhere),
        this.employeeSummaryRows(tx, sqlWhere),
        this.projectSummaryRows(tx, sqlWhere),
      ]);
      const employees = employeeRows.map((row) => ({
        employeeId: row.employeeId,
        displayName: row.displayName,
        department: row.department,
        roleTitle: row.roleTitle,
        metrics: this.metricsFromRaw(row, facts.missingWeeks),
        sourceBatchIds: row.sourceBatchIds,
        employeeProgressUrl: this.employeeProgressUrl(row.employeeId, period, {
          department: query.department,
          projectId: query.projectId,
          status: query.status,
        }),
        workItemsUrl: this.workItemsUrl(period, {
          employeeId: row.employeeId,
          department: query.department,
          projectId: query.projectId,
          status: query.status,
        }),
      }));
      const projects = projectRows.map((row) => ({
        projectId: row.projectId,
        projectCode: row.projectCode,
        projectName: row.projectName,
        archived: row.archived,
        participantCount: this.rawNumber(row.participantCount),
        metrics: this.metricsFromRaw(row, facts.missingWeeks),
        sourceBatchIds: row.sourceBatchIds,
        ...(!row.archived
          ? {
              projectProgressUrl: this.projectProgressUrl(row.projectId, period, {
                department: query.department,
                status: query.status,
              }),
            }
          : {}),
        workItemsUrl: this.workItemsUrl(period, {
          projectId: row.projectId,
          department: query.department,
          status: query.status,
        }),
      }));
      return {
        period: this.publicPeriod(period),
        metrics: facts.metrics,
        sourceBatchIds: facts.sourceBatchIds,
        employees: this.boundedRows(employees, employeeRows, GROUP_SUMMARY_LIMIT),
        projects: this.boundedRows(projects, projectRows, GROUP_SUMMARY_LIMIT),
        risks: this.boundedWithTotal(facts.risks, RISK_SUMMARY_LIMIT, facts.metrics.riskCount),
        links: {
          workItemsUrl: this.workItemsUrl(period, {
            department: query.department,
            projectId: query.projectId,
            status: query.status,
          }),
        },
      };
    }, QUERY_TRANSACTION_OPTIONS);
  }

  async workItems(query: EmployeeWorkItemsQuery) {
    const period = this.periodBounds(query.periodType, query.periodStart);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const where = this.workItemWhere(query, period);
    const result = await this.prisma.$transaction(async (tx) => {
      const [data, total, batches] = await Promise.all([
        tx.employeeWorkItem.findMany({
          where,
          select: WORK_ITEM_SELECT,
          orderBy: [{ periodStartAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.employeeWorkItem.count({ where }),
        this.currentBatches(tx, period),
      ]);
      return { data, total, batches };
    }, QUERY_TRANSACTION_OPTIONS);
    return {
      period: this.publicPeriod(period),
      data: result.data.map((item) => this.publicWorkItem(item, period, query)),
      meta: { page, pageSize, total: result.total },
      sourceBatchIds: result.batches.map(({ id }) => id),
      links: {
        progressUrl: this.progressUrl(period, query),
      },
    };
  }

  async workItem(id: string) {
    const item = await this.prisma.employeeWorkItem.findFirst({
      where: {
        id,
        archivedAt: null,
        employee: { archivedAt: null },
        importBatch: {
          status: EmployeeWorkImportStatus.COMPLETED,
          archivedAt: null,
        },
      },
      select: WORK_ITEM_SELECT,
    });
    if (!item) {
      throw new AppError({
        code: ErrorCodes.RESOURCE_NOT_FOUND,
        message: 'Employee work item not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    const period = this.periodBounds(
      EmployeeProgressPeriod.WEEK,
      this.dateOnly(item.periodStartAt),
    );
    return this.publicWorkItem(item, period);
  }

  async employee(id: string, query: EmployeeProgressQuery) {
    return this.prisma.$transaction(async (tx) => {
      const period = this.periodBounds(query.periodType, query.periodStart);
      const scopedQuery = { ...query, employeeId: id };
      const sqlWhere = this.dashboardSqlWhere(scopedQuery, period);
      const [employee, facts, projectRows] = await Promise.all([
        tx.resourceProfile.findFirst({
          where: { id, archivedAt: null },
          select: {
            id: true,
            displayName: true,
            department: true,
            roleTitle: true,
            managerName: true,
            employmentStatus: true,
            weeklyCapacityHours: true,
          },
        }),
        this.dashboardFactsFrom(tx, scopedQuery, period, sqlWhere),
        this.projectSummaryRows(tx, sqlWhere),
      ]);
      if (!employee) {
        throw new AppError({
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: 'Employee not found',
          statusCode: HttpStatus.NOT_FOUND,
        });
      }
      const projects = projectRows.map((row) => {
        return {
          projectId: row.projectId,
          projectCode: row.projectCode,
          projectName: row.projectName,
          archived: row.archived,
          metrics: this.metricsFromRaw(row, facts.missingWeeks),
          sourceBatchIds: row.sourceBatchIds,
          ...(!row.archived
            ? {
                projectProgressUrl: this.projectProgressUrl(row.projectId, period, {
                  department: query.department,
                  status: query.status,
                }),
              }
            : {}),
          workItemsUrl: this.workItemsUrl(period, {
            employeeId: id,
            projectId: row.projectId,
            department: query.department,
            status: query.status,
          }),
        };
      });
      return {
        employee,
        period: this.publicPeriod(period),
        metrics: facts.metrics,
        sourceBatchIds: facts.sourceBatchIds,
        projects: this.boundedRows(projects, projectRows, GROUP_SUMMARY_LIMIT),
        risks: this.boundedWithTotal(facts.risks, RISK_SUMMARY_LIMIT, facts.metrics.riskCount),
        links: {
          workItemsUrl: this.workItemsUrl(period, {
            employeeId: id,
            department: query.department,
            projectId: query.projectId,
            status: query.status,
          }),
        },
      };
    }, QUERY_TRANSACTION_OPTIONS);
  }

  async project(id: string, query: EmployeeProgressQuery) {
    return this.prisma.$transaction(async (tx) => {
      const period = this.periodBounds(query.periodType, query.periodStart);
      const scopedQuery = { ...query, projectId: id };
      const sqlWhere = this.dashboardSqlWhere(scopedQuery, period);
      const [project, facts, employeeRows] = await Promise.all([
        tx.project.findFirst({
          where: { id, archivedAt: null },
          select: { id: true, code: true, name: true, status: true },
        }),
        this.dashboardFactsFrom(tx, scopedQuery, period, sqlWhere),
        this.employeeSummaryRows(tx, sqlWhere),
      ]);
      if (!project) {
        throw new AppError({
          code: ErrorCodes.PROJECT_NOT_FOUND,
          message: 'Project not found',
          statusCode: HttpStatus.NOT_FOUND,
        });
      }
      const employeeIds = employeeRows.map(({ employeeId }) => employeeId);
      const [completedRows, nextPlanRows, employeeRiskRows] = await this.projectEmployeeDetailRows(
        tx,
        sqlWhere,
        employeeIds,
      );
      const employees = employeeRows.map((row) => ({
        employeeId: row.employeeId,
        displayName: row.displayName,
        department: row.department,
        metrics: this.metricsFromRaw(row, facts.missingWeeks),
        completedItems: this.employeeDetails(completedRows, row.employeeId, 'title'),
        nextPlans: this.employeeDetails(nextPlanRows, row.employeeId, 'text'),
        risks: this.employeeDetails(employeeRiskRows, row.employeeId, 'text'),
        sourceBatchIds: row.sourceBatchIds,
        employeeProgressUrl: this.employeeProgressUrl(row.employeeId, period, {
          department: query.department,
          projectId: id,
          status: query.status,
        }),
        workItemsUrl: this.workItemsUrl(period, {
          employeeId: row.employeeId,
          projectId: id,
          department: query.department,
          status: query.status,
        }),
      }));
      return {
        project,
        period: this.publicPeriod(period),
        metrics: facts.metrics,
        sourceBatchIds: facts.sourceBatchIds,
        employees: this.boundedRows(employees, employeeRows, GROUP_SUMMARY_LIMIT),
        risks: this.boundedWithTotal(facts.risks, RISK_SUMMARY_LIMIT, facts.metrics.riskCount),
        links: {
          workItemsUrl: this.workItemsUrl(period, {
            projectId: id,
            department: query.department,
            status: query.status,
          }),
        },
      };
    }, QUERY_TRANSACTION_OPTIONS);
  }

  async listImports(query: EmployeeImportHistoryQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const periodStartAt = query.periodStart
      ? this.strictDateOnly(query.periodStart, 'periodStart')
      : undefined;
    const where: Prisma.EmployeeWorkImportBatchWhereInput = {
      ...(query.periodType ? { periodType: query.periodType } : {}),
      ...(periodStartAt ? { periodStartAt } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const { data, total } = await this.prisma.$transaction(async (tx) => {
      const [records, count] = await Promise.all([
        tx.employeeWorkImportBatch.findMany({
          where,
          orderBy: [
            { periodStartAt: 'desc' },
            { version: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.employeeWorkImportBatch.count({ where }),
      ]);
      return { data: records, total: count };
    }, QUERY_TRANSACTION_OPTIONS);
    return {
      data: await Promise.all(data.map((batch) => this.publicImportBatch(batch))),
      meta: { page, pageSize, total },
      sourceBatchIds: data.map(({ id }) => id),
    };
  }

  async getImport(id: string, query: EmployeeImportDetailQuery = {}) {
    const rowsPage = Math.max(1, query.rowsPage ?? 1);
    const rowsPageSize = Math.min(
      Math.max(1, query.rowsPageSize ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const rowWhere: Prisma.EmployeeWorkImportRowWhereInput = {
      batchId: id,
      ...(query.rowStatus ? { status: query.rowStatus } : {}),
      ...(query.issuesOnly
        ? {
            AND: [
              {
                status: {
                  in: [EmployeeImportRowStatus.ERROR, EmployeeImportRowStatus.UNRESOLVED],
                },
              },
            ],
          }
        : {}),
    };
    const { batch, rows, rowTotal } = await this.prisma.$transaction(async (tx) => {
      const record = await tx.employeeWorkImportBatch.findUnique({ where: { id } });
      if (!record) return { batch: null, rows: [], rowTotal: 0 };
      const [pagedRows, count] = await Promise.all([
        tx.employeeWorkImportRow.findMany({
          where: rowWhere,
          orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
          skip: (rowsPage - 1) * rowsPageSize,
          take: rowsPageSize,
          include: {
            workItem: { select: { id: true, archivedAt: true } },
          },
        }),
        tx.employeeWorkImportRow.count({ where: rowWhere }),
      ]);
      return { batch: record, rows: pagedRows, rowTotal: count };
    }, QUERY_TRANSACTION_OPTIONS);
    if (!batch) {
      throw new AppError({
        code: ErrorCodes.EMPLOYEE_IMPORT_NOT_FOUND,
        message: 'Employee work import batch not found',
        statusCode: HttpStatus.NOT_FOUND,
      });
    }
    return {
      ...(await this.publicImportBatch(batch)),
      sourceBatchIds: [id],
      rows: rows.map((row) => ({
        id: row.id,
        rowNumber: row.rowNumber,
        status: row.status,
        errors: row.errors,
        rawValues: row.rawValues,
        normalizedValues: row.normalizedValues,
        resolvedEmployeeId: row.resolvedEmployeeId,
        resolvedProjectId: row.resolvedProjectId,
        resolvedTaskId: row.resolvedTaskId,
        keepUnlinked: row.keepUnlinked,
        workItemId: row.workItem?.id ?? null,
        links: {
          ...(row.workItem?.id && row.workItem.archivedAt === null
            ? { workItem: `/employee-work-items/${row.workItem.id}` }
            : {}),
          sourceBatch: `/employee-work-imports/${id}`,
        },
      })),
      rowMeta: { page: rowsPage, pageSize: rowsPageSize, total: rowTotal },
    };
  }

  private async dashboardFactsFrom(
    tx: Prisma.TransactionClient,
    query: EmployeeWorkItemsQuery,
    period: PeriodBounds,
    sqlWhere: Prisma.Sql,
  ) {
    const [batches, metricsRows, riskIdRows] = await Promise.all([
      this.currentBatches(tx, period),
      tx.$queryRaw<RawMetricsRow[]>(Prisma.sql`
        /* employee_progress:metrics */
        SELECT ${this.rawMetricSelect()}
        ${this.dashboardFrom()}
        WHERE ${sqlWhere}
      `),
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        /* employee_progress:risk_ids */
        SELECT wi.id
        ${this.dashboardFrom()}
        WHERE ${sqlWhere}
          AND ${this.rawRiskCondition()}
        ORDER BY wi.period_start_at ASC, wi.created_at ASC, wi.id ASC
        LIMIT ${RISK_SUMMARY_LIMIT}
      `),
    ]);
    const missingWeeks = this.missingWeeks(
      period,
      batches.map(({ periodStartAt }) => periodStartAt),
    );
    const metrics = this.metricsFromRaw(metricsRows[0], missingWeeks);
    const riskIds = riskIdRows.map(({ id }) => id);
    const risks =
      riskIds.length === 0
        ? []
        : (
            await tx.employeeWorkItem.findMany({
              where: {
                ...this.workItemWhere(query, period),
                id: { in: riskIds },
              },
              select: WORK_ITEM_SELECT,
              orderBy: [{ periodStartAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              take: RISK_SUMMARY_LIMIT,
            })
          ).map((item) => this.publicWorkItemSummary(item, period, query));
    return {
      metrics,
      risks,
      missingWeeks,
      sourceBatchIds: batches.map(({ id }) => id),
    };
  }

  private employeeSummaryRows(tx: Prisma.TransactionClient, sqlWhere: Prisma.Sql) {
    return tx.$queryRaw<RawEmployeeSummaryRow[]>(Prisma.sql`
      /* employee_progress:employee_summaries */
      WITH grouped AS (
        SELECT
          wi.employee_id AS "employeeId",
          employee.display_name AS "displayName",
          employee.department,
          employee.role_title AS "roleTitle",
          ARRAY_AGG(DISTINCT wi.import_batch_id ORDER BY wi.import_batch_id) AS "sourceBatchIds",
          ${this.rawMetricSelect()}
        ${this.dashboardFrom()}
        WHERE ${sqlWhere}
        GROUP BY wi.employee_id, employee.display_name, employee.department, employee.role_title
      )
      SELECT grouped.*, COUNT(*) OVER()::integer AS total
      FROM grouped
      ORDER BY "displayName" ASC, "employeeId" ASC
      LIMIT ${GROUP_SUMMARY_LIMIT}
    `);
  }

  private projectSummaryRows(tx: Prisma.TransactionClient, sqlWhere: Prisma.Sql) {
    return tx.$queryRaw<RawProjectSummaryRow[]>(Prisma.sql`
      /* employee_progress:project_summaries */
      WITH grouped AS (
        SELECT
          wi.project_id AS "projectId",
          project.code AS "projectCode",
          project.name AS "projectName",
          (project.archived_at IS NOT NULL) AS archived,
          COUNT(DISTINCT wi.employee_id)::integer AS "participantCount",
          ARRAY_AGG(DISTINCT wi.import_batch_id ORDER BY wi.import_batch_id) AS "sourceBatchIds",
          ${this.rawMetricSelect()}
        ${this.dashboardFrom()}
        WHERE ${sqlWhere}
          AND wi.project_id IS NOT NULL
        GROUP BY wi.project_id, project.code, project.name, project.archived_at
      )
      SELECT grouped.*, COUNT(*) OVER()::integer AS total
      FROM grouped
      ORDER BY "actualHours" DESC, "projectCode" ASC, "projectId" ASC
      LIMIT ${GROUP_SUMMARY_LIMIT}
    `);
  }

  private projectEmployeeDetailRows(
    tx: Prisma.TransactionClient,
    sqlWhere: Prisma.Sql,
    employeeIds: string[],
  ): Promise<[RawEmployeeDetailRow[], RawEmployeeDetailRow[], RawEmployeeDetailRow[]]> {
    if (employeeIds.length === 0) return Promise.resolve([[], [], []]);
    const employeeFilter = Prisma.sql`wi.employee_id IN (${Prisma.join(employeeIds)})`;
    return Promise.all([
      tx.$queryRaw<RawEmployeeDetailRow[]>(Prisma.sql`
        /* employee_progress:completed_details */
        WITH ranked AS (
          SELECT
            wi.employee_id AS "employeeId",
            wi.id AS "workItemId",
            wi.title AS text,
            ROW_NUMBER() OVER (
              PARTITION BY wi.employee_id
              ORDER BY wi.period_start_at ASC, wi.created_at ASC, wi.id ASC
            ) AS row_number,
            COUNT(*) OVER (PARTITION BY wi.employee_id)::integer AS total
          ${this.dashboardFrom()}
          WHERE ${sqlWhere}
            AND ${employeeFilter}
            AND wi.status::text = ${EmployeeWorkStatus.COMPLETED}
        )
        SELECT "employeeId", "workItemId", text, total
        FROM ranked
        WHERE row_number <= ${DETAIL_SUMMARY_LIMIT}
        ORDER BY "employeeId" ASC, row_number ASC
      `),
      tx.$queryRaw<RawEmployeeDetailRow[]>(Prisma.sql`
        /* employee_progress:next_plan_details */
        WITH ranked AS (
          SELECT
            wi.employee_id AS "employeeId",
            wi.id AS "workItemId",
            wi.next_plan_text AS text,
            ROW_NUMBER() OVER (
              PARTITION BY wi.employee_id
              ORDER BY wi.period_start_at ASC, wi.created_at ASC, wi.id ASC
            ) AS row_number,
            COUNT(*) OVER (PARTITION BY wi.employee_id)::integer AS total
          ${this.dashboardFrom()}
          WHERE ${sqlWhere}
            AND ${employeeFilter}
            AND wi.next_plan_text IS NOT NULL
            AND BTRIM(wi.next_plan_text) <> ''
        )
        SELECT "employeeId", "workItemId", text, total
        FROM ranked
        WHERE row_number <= ${DETAIL_SUMMARY_LIMIT}
        ORDER BY "employeeId" ASC, row_number ASC
      `),
      tx.$queryRaw<RawEmployeeDetailRow[]>(Prisma.sql`
        /* employee_progress:risk_details */
        WITH ranked AS (
          SELECT
            wi.employee_id AS "employeeId",
            wi.id AS "workItemId",
            wi.risk_text AS text,
            ROW_NUMBER() OVER (
              PARTITION BY wi.employee_id
              ORDER BY wi.period_start_at ASC, wi.created_at ASC, wi.id ASC
            ) AS row_number,
            COUNT(*) OVER (PARTITION BY wi.employee_id)::integer AS total
          ${this.dashboardFrom()}
          WHERE ${sqlWhere}
            AND ${employeeFilter}
            AND ${this.rawRiskCondition()}
        )
        SELECT "employeeId", "workItemId", text, total
        FROM ranked
        WHERE row_number <= ${DETAIL_SUMMARY_LIMIT}
        ORDER BY "employeeId" ASC, row_number ASC
      `),
    ]);
  }

  private dashboardSqlWhere(query: EmployeeWorkItemsQuery, period: PeriodBounds): Prisma.Sql {
    const batchWindowStart = this.batchWindowStart(period);
    const conditions: Prisma.Sql[] = [
      Prisma.sql`batch.period_type = ${EmployeeProgressPeriod.WEEK}::app."EmployeeProgressPeriod"`,
      ...(period.type === EmployeeProgressPeriod.WEEK
        ? [
            Prisma.sql`batch.period_start_at = ${period.startAt}::date`,
            Prisma.sql`batch.period_end_at = ${period.endAt}::date`,
          ]
        : [
            Prisma.sql`batch.period_start_at >= ${batchWindowStart}::date`,
            Prisma.sql`batch.period_start_at <= ${period.endAt}::date`,
            Prisma.sql`batch.period_end_at >= ${period.startAt}::date`,
            Prisma.sql`batch.period_end_at <= ${period.endAt}::date`,
          ]),
      Prisma.sql`batch.status = ${EmployeeWorkImportStatus.COMPLETED}::app."EmployeeWorkImportStatus"`,
      Prisma.sql`batch.archived_at IS NULL`,
      Prisma.sql`wi.archived_at IS NULL`,
      Prisma.sql`employee.archived_at IS NULL`,
      Prisma.sql`wi.period_end_at >= ${period.startAt}::date`,
      Prisma.sql`wi.period_end_at <= ${period.endAt}::date`,
    ];
    if (period.type === EmployeeProgressPeriod.WEEK) {
      conditions.push(Prisma.sql`wi.period_start_at = ${period.startAt}::date`);
    }
    if (query.employeeId) {
      conditions.push(Prisma.sql`wi.employee_id = ${query.employeeId}`);
    }
    if (query.department) {
      conditions.push(Prisma.sql`employee.department = ${query.department}`);
    }
    if (query.projectId) {
      conditions.push(Prisma.sql`wi.project_id = ${query.projectId}`);
    }
    if (query.status) {
      conditions.push(Prisma.sql`wi.status::text = ${query.status}`);
    }
    return Prisma.join(conditions, ' AND ');
  }

  private dashboardFrom(): Prisma.Sql {
    return Prisma.sql`
      FROM app.employee_work_items AS wi
      INNER JOIN app.resource_profiles AS employee ON employee.id = wi.employee_id
      INNER JOIN app.employee_work_import_batches AS batch ON batch.id = wi.import_batch_id
      LEFT JOIN app.projects AS project ON project.id = wi.project_id
      LEFT JOIN app.tasks AS task ON task.id = wi.task_id
    `;
  }

  private rawMetricSelect(): Prisma.Sql {
    return Prisma.sql`
      COUNT(*)::integer AS "workItemCount",
      COUNT(*) FILTER (
        WHERE wi.status::text = ${EmployeeWorkStatus.COMPLETED}
      )::integer AS "completedCount",
      AVG(wi.completion_rate)::double precision AS "averageCompletionRate",
      COALESCE(SUM(wi.planned_hours), 0)::double precision AS "plannedHours",
      COALESCE(SUM(wi.actual_hours), 0)::double precision AS "actualHours",
      COUNT(*) FILTER (
        WHERE ${this.rawRiskCondition()}
      )::integer AS "riskCount",
      COUNT(*) FILTER (
        WHERE wi.status::text = ${EmployeeWorkStatus.BLOCKED}
      )::integer AS "blockedCount",
      COUNT(DISTINCT wi.project_id)::integer AS "projectCount",
      COUNT(*) FILTER (
        WHERE wi.project_id IS NULL
      )::integer AS "unlinkedCount"
    `;
  }

  private rawRiskCondition(): Prisma.Sql {
    return Prisma.sql`(
      (wi.risk_text IS NOT NULL AND BTRIM(wi.risk_text) <> '')
      OR wi.status::text IN (
        ${EmployeeWorkStatus.AT_RISK},
        ${EmployeeWorkStatus.BLOCKED}
      )
    )`;
  }

  private currentBatches(tx: Prisma.TransactionClient, period: PeriodBounds) {
    return tx.employeeWorkImportBatch.findMany({
      where: this.currentBatchWhere(period),
      select: { id: true, periodStartAt: true, periodEndAt: true },
      orderBy: [{ periodStartAt: 'asc' }, { id: 'asc' }],
    });
  }

  private workItemWhere(
    query: EmployeeWorkItemsQuery,
    period: PeriodBounds,
  ): Prisma.EmployeeWorkItemWhereInput {
    return {
      archivedAt: null,
      periodEndAt: { gte: period.startAt, lte: period.endAt },
      ...(period.type === EmployeeProgressPeriod.WEEK ? { periodStartAt: period.startAt } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      employee: {
        archivedAt: null,
        ...(query.department ? { department: query.department } : {}),
      },
      importBatch: {
        ...this.currentBatchWhere(period),
      },
    };
  }

  private currentBatchWhere(period: PeriodBounds): Prisma.EmployeeWorkImportBatchWhereInput {
    if (period.type === EmployeeProgressPeriod.WEEK) {
      return {
        periodType: EmployeeProgressPeriod.WEEK,
        periodStartAt: period.startAt,
        periodEndAt: period.endAt,
        status: EmployeeWorkImportStatus.COMPLETED,
        archivedAt: null,
      };
    }
    return {
      periodType: EmployeeProgressPeriod.WEEK,
      periodStartAt: {
        gte: this.batchWindowStart(period),
        lte: period.endAt,
      },
      periodEndAt: {
        gte: period.startAt,
        lte: period.endAt,
      },
      status: EmployeeWorkImportStatus.COMPLETED,
      archivedAt: null,
    };
  }

  private batchWindowStart(period: PeriodBounds): Date {
    if (period.type === EmployeeProgressPeriod.WEEK) return period.startAt;
    const firstWeekEndOffset = (7 - period.startAt.getUTCDay()) % 7;
    return new Date(period.startAt.getTime() + (firstWeekEndOffset - 6) * DAY_MS);
  }

  private publicWorkItem(
    item: QueryWorkItem,
    period: PeriodBounds,
    filters: Partial<EmployeeWorkItemsQuery> = {},
  ) {
    return {
      id: item.id,
      employeeId: item.employeeId,
      employeeName: item.employee.displayName,
      department: item.employee.department,
      importBatchId: item.importBatchId,
      importVersion: item.importBatch.version,
      sourceRowId: item.sourceRowId,
      sourceRowNumber: item.sourceRow.rowNumber,
      sourceBatchIds: [item.importBatchId],
      periodStart: this.dateOnly(item.periodStartAt),
      periodEnd: this.dateOnly(item.periodEndAt),
      title: item.title,
      planText: item.planText,
      summaryText: item.summaryText,
      completionRate: item.completionRate,
      status: item.status,
      nextPlanText: item.nextPlanText,
      riskText: item.riskText,
      plannedHours: this.decimalNumber(item.plannedHours),
      actualHours: this.decimalNumber(item.actualHours),
      project: item.project
        ? {
            id: item.project.id,
            code: item.project.code,
            name: item.project.name,
            archived: item.project.archivedAt !== null,
          }
        : null,
      task: item.task
        ? {
            id: item.task.id,
            code: item.task.code,
            title: item.task.title,
            archived: item.task.archivedAt !== null,
          }
        : null,
      riskId: item.riskId,
      note: item.note,
      links: {
        selfUrl: `/employee-work-items/${item.id}`,
        employeeProgressUrl: this.employeeProgressUrl(item.employeeId, period, {
          department: filters.department,
          projectId: filters.projectId,
          status: filters.status,
        }),
        ...(item.projectId && item.project?.archivedAt === null
          ? {
              projectProgressUrl: this.projectProgressUrl(item.projectId, period, {
                department: filters.department,
                status: filters.status,
              }),
            }
          : {}),
        ...(item.projectId &&
        item.project?.archivedAt === null &&
        item.taskId &&
        item.task?.archivedAt === null
          ? { taskUrl: `/projects/${item.projectId}?taskId=${encodeURIComponent(item.taskId)}` }
          : {}),
        sourceBatchUrl: `/employee-work-imports/${item.importBatchId}`,
      },
    };
  }

  private publicWorkItemSummary(
    item: QueryWorkItem,
    period: PeriodBounds,
    filters: Partial<EmployeeWorkItemsQuery> = {},
  ) {
    return {
      id: item.id,
      title: item.title,
      employeeId: item.employeeId,
      employeeName: item.employee.displayName,
      projectId: item.projectId,
      projectCode: item.project?.code ?? null,
      status: item.status,
      riskText: item.riskText,
      sourceBatchIds: [item.importBatchId],
      links: this.publicWorkItem(item, period, filters).links,
    };
  }

  private async publicImportBatch(batch: EmployeeWorkImportBatch) {
    const logicallyAvailable = !isEmployeeImportBatchExpired(batch, new Date());
    const [sourceAvailable, errorAvailable] = logicallyAvailable
      ? await Promise.all([
          this.storageFileExists(batch.sourceStorageKey),
          batch.errorStorageKey ? this.storageFileExists(batch.errorStorageKey) : false,
        ])
      : [false, false];
    const safe = Object.fromEntries(
      Object.entries(batch).filter(
        ([key]) =>
          key !== 'sourceStorageKey' &&
          key !== 'errorStorageKey' &&
          key !== 'previewFingerprint' &&
          key !== 'periodStartAt' &&
          key !== 'periodEndAt' &&
          key !== 'rows',
      ),
    );
    const id = String(batch.id);
    return {
      ...safe,
      periodStart:
        batch.periodStartAt instanceof Date ? this.dateOnly(batch.periodStartAt) : undefined,
      periodEnd: batch.periodEndAt instanceof Date ? this.dateOnly(batch.periodEndAt) : undefined,
      hasErrors: Boolean(batch.errorStorageKey),
      sourceAvailable,
      errorAvailable,
      sourceBatchIds: [id],
      links: {
        self: `/employee-work-imports/${id}`,
        ...(sourceAvailable ? { source: `/employee-work-imports/${id}/source` } : {}),
        ...(errorAvailable ? { errors: `/employee-work-imports/${id}/errors` } : {}),
        ...(sourceAvailable &&
        (batch.status === EmployeeWorkImportStatus.COMPLETED ||
          batch.status === EmployeeWorkImportStatus.SUPERSEDED)
          ? { restore: `/employee-work-imports/${id}/restore` }
          : {}),
      },
    };
  }

  private metricsFromRaw(row: RawMetricsRow | undefined, missingWeeks: string[]): ProgressMetrics {
    const workItemCount = this.rawNumber(row?.workItemCount);
    const completedCount = this.rawNumber(row?.completedCount);
    return {
      workItemCount,
      completedCount,
      completionRate:
        workItemCount === 0 ? null : this.round((completedCount / workItemCount) * 100),
      averageCompletionRate:
        row?.averageCompletionRate === null || row?.averageCompletionRate === undefined
          ? null
          : this.round(Number(row.averageCompletionRate)),
      plannedHours: this.round(Number(row?.plannedHours ?? 0)),
      actualHours: this.round(Number(row?.actualHours ?? 0)),
      riskCount: this.rawNumber(row?.riskCount),
      blockedCount: this.rawNumber(row?.blockedCount),
      projectCount: this.rawNumber(row?.projectCount),
      unlinkedCount: this.rawNumber(row?.unlinkedCount),
      dataComplete: missingWeeks.length === 0,
      missingWeeks,
    };
  }

  private periodBounds(type: EmployeeProgressPeriod, startValue: string): PeriodBounds {
    const startAt = this.strictDateOnly(startValue, 'periodStart');
    if (type === EmployeeProgressPeriod.WEEK && startAt.getUTCDay() !== 1) {
      throw this.invalidPeriod('Weekly progress periodStart must be a Monday in UTC');
    }
    if (type === EmployeeProgressPeriod.MONTH && startAt.getUTCDate() !== 1) {
      throw this.invalidPeriod('Monthly progress periodStart must be the first day in UTC');
    }
    const endAt =
      type === EmployeeProgressPeriod.WEEK
        ? new Date(startAt.getTime() + 6 * DAY_MS)
        : new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth() + 1, 0));
    return {
      type,
      startAt,
      endAt,
      start: this.dateOnly(startAt),
      end: this.dateOnly(endAt),
    };
  }

  private strictDateOnly(value: string, field: string): Date {
    if (!DATE_ONLY_PATTERN.test(value)) {
      throw this.invalidPeriod(`${field} must use YYYY-MM-DD`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || this.dateOnly(parsed) !== value) {
      throw this.invalidPeriod(`${field} must be a valid UTC calendar date`);
    }
    return parsed;
  }

  private missingWeeks(period: PeriodBounds, availableWeekStarts: Date[]): string[] {
    const available = new Set(availableWeekStarts.map((value) => this.dateOnly(value)));
    if (period.type === EmployeeProgressPeriod.WEEK) {
      return available.has(period.start) ? [] : [period.start];
    }
    const firstWeekEndOffset = (7 - period.startAt.getUTCDay()) % 7;
    const firstWeekEnd = new Date(period.startAt.getTime() + firstWeekEndOffset * DAY_MS);
    const missing: string[] = [];
    for (
      let weekEnd = firstWeekEnd;
      weekEnd <= period.endAt;
      weekEnd = new Date(weekEnd.getTime() + 7 * DAY_MS)
    ) {
      const weekStart = this.dateOnly(new Date(weekEnd.getTime() - 6 * DAY_MS));
      if (!available.has(weekStart)) missing.push(weekStart);
    }
    return missing;
  }

  private workItemsUrl(
    period: PeriodBounds,
    filters: {
      employeeId?: string;
      department?: string;
      projectId?: string;
      status?: EmployeeWorkStatus;
    } = {},
  ): string {
    const query = new URLSearchParams({
      periodType: period.type,
      periodStart: period.start,
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    return `/employee-work-items?${query.toString()}`;
  }

  private progressUrl(period: PeriodBounds, filters: Partial<EmployeeWorkItemsQuery> = {}): string {
    if (filters.employeeId) {
      return this.employeeProgressUrl(filters.employeeId, period, {
        department: filters.department,
        projectId: filters.projectId,
        status: filters.status,
      });
    }
    const query = new URLSearchParams({
      periodType: period.type,
      periodStart: period.start,
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    return `/employee-progress?${query.toString()}`;
  }

  private employeeProgressUrl(
    employeeId: string,
    period: PeriodBounds,
    filters: {
      department?: string;
      projectId?: string;
      status?: EmployeeWorkStatus;
    } = {},
  ): string {
    const query = new URLSearchParams({
      periodType: period.type,
      periodStart: period.start,
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    return `/employees/${encodeURIComponent(employeeId)}/progress?${query.toString()}`;
  }

  private projectProgressUrl(
    projectId: string,
    period: PeriodBounds,
    filters: { department?: string; status?: EmployeeWorkStatus } = {},
  ): string {
    const query = new URLSearchParams({
      periodType: period.type,
      periodStart: period.start,
      ...(filters.department ? { department: filters.department } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    return `/projects/${encodeURIComponent(projectId)}/team-progress?${query.toString()}`;
  }

  private publicPeriod(period: PeriodBounds) {
    return { type: period.type, start: period.start, end: period.end };
  }

  private boundedWithTotal<T>(values: T[], limit: number, total: number) {
    return {
      data: values.slice(0, limit),
      total,
      limit,
      hasMore: total > limit,
    };
  }

  private boundedRows<T, TRow extends { total: number | bigint }>(
    values: T[],
    rows: TRow[],
    limit: number,
  ) {
    return this.boundedWithTotal(values, limit, this.rawNumber(rows[0]?.total));
  }

  private employeeDetails(
    rows: RawEmployeeDetailRow[],
    employeeId: string,
    label: 'title' | 'text',
  ) {
    const employeeRows = rows.filter((row) => row.employeeId === employeeId);
    const values = employeeRows.map((row) => ({
      workItemId: row.workItemId,
      [label]: row.text,
    }));
    return this.boundedWithTotal(
      values,
      DETAIL_SUMMARY_LIMIT,
      this.rawNumber(employeeRows[0]?.total),
    );
  }

  private rawNumber(value: number | bigint | null | undefined): number {
    return value === null || value === undefined ? 0 : Number(value);
  }

  private decimalNumber(value: Prisma.Decimal | number | null): number {
    return value === null ? 0 : Number(value);
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async storageFileExists(storageKey: string): Promise<boolean> {
    try {
      const entry = await this.storage.stat(storageKey);
      return entry.kind === 'FILE';
    } catch {
      return false;
    }
  }

  private invalidPeriod(message: string): AppError {
    return new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
