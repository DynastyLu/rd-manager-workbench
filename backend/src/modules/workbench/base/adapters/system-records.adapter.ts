import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DataTableSource,
  DecisionStatus,
  MeetingActionStatus,
  MeetingStatus,
  ProjectPhase,
  ProjectStatus,
  RiskLevel,
  RiskStatus,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { DocumentsService } from '../../content/application/documents.service';
import { DecisionsService } from '../../management/application/decisions.service';
import { MeetingsService } from '../../management/application/meetings.service';
import { RisksService } from '../../management/application/risks.service';
import { ProjectsService } from '../../projects/application/projects.service';
import { TasksService } from '../../tasks/application/tasks.service';
import { RecordQuery, UnifiedDataRecord } from '../domain/base.types';

type Values = Record<string, unknown>;

const WRITABLE_KEYS: Record<Exclude<DataTableSource, 'CUSTOM' | 'MEETING_ACTIONS' | 'RISKS_DECISIONS'>, ReadonlySet<string>> = {
  PROJECTS: new Set(['name', 'code', 'status', 'phase', 'leadName', 'plannedStartAt', 'plannedEndAt']),
  WORK_TASKS: new Set(['title', 'status', 'priority', 'assigneeName', 'description', 'dueAt', 'projectId']),
  DOCUMENTS: new Set(['title', 'tags', 'isFavorite', 'projectId']),
};
const MEETING_WRITABLE_KEYS = new Set(['title', 'status', 'dateAt']);
const ACTION_WRITABLE_KEYS = new Set(['title', 'status', 'ownerName', 'dateAt']);
const RISK_WRITABLE_KEYS = new Set(['title', 'status', 'level', 'ownerName', 'projectId']);
const DECISION_WRITABLE_KEYS = new Set(['title', 'status', 'projectId']);

@Injectable()
export class SystemRecordsAdapter {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
    private readonly meetings: MeetingsService,
    private readonly documents: DocumentsService,
    private readonly risks: RisksService,
    private readonly decisions: DecisionsService,
  ) {}

  async list(source: DataTableSource, query: RecordQuery) {
    const records = await this.load(source);
    return this.applyQuery(records, query);
  }

  async findByIds(source: DataTableSource, ids: readonly string[]): Promise<UnifiedDataRecord[]> {
    const requested = new Set(ids);
    return (await this.load(source)).filter((record) => requested.has(record.id));
  }

  async update(source: DataTableSource, recordId: string, values: Values) {
    this.assertWritable(source, recordId, values);
    switch (source) {
      case DataTableSource.PROJECTS:
        await this.projects.update(recordId, {
          ...(this.string(values.name) !== undefined ? { name: this.string(values.name)! } : {}),
          ...(this.string(values.code) !== undefined ? { code: this.string(values.code)! } : {}),
          ...(this.enumValue(values.status, ProjectStatus) !== undefined ? { status: this.enumValue(values.status, ProjectStatus)! } : {}),
          ...(this.enumValue(values.phase, ProjectPhase) !== undefined ? { phase: this.enumValue(values.phase, ProjectPhase)! } : {}),
          ...(this.string(values.leadName) !== undefined ? { leadName: this.string(values.leadName)! } : {}),
          ...(this.dateString(values.plannedStartAt) !== undefined ? { plannedStartAt: this.dateString(values.plannedStartAt)! } : {}),
          ...(this.dateString(values.plannedEndAt) !== undefined ? { plannedEndAt: this.dateString(values.plannedEndAt)! } : {}),
        });
        break;
      case DataTableSource.WORK_TASKS:
        await this.tasks.updateTask(recordId, {
          ...(this.string(values.title) !== undefined ? { title: this.string(values.title)! } : {}),
          ...(this.enumValue(values.status, TaskStatus) !== undefined ? { status: this.enumValue(values.status, TaskStatus)! } : {}),
          ...(this.enumValue(values.priority, TaskPriority) !== undefined ? { priority: this.enumValue(values.priority, TaskPriority)! } : {}),
          ...(this.string(values.assigneeName) !== undefined ? { assigneeName: this.string(values.assigneeName)! } : {}),
          ...(this.string(values.description) !== undefined ? { description: this.string(values.description)! } : {}),
          ...(this.dateString(values.dueAt) !== undefined ? { dueAt: this.dateString(values.dueAt)! } : {}),
          ...(this.string(values.projectId) !== undefined ? { projectId: this.string(values.projectId)! } : {}),
        });
        break;
      case DataTableSource.MEETING_ACTIONS: {
        const [kind, id] = this.parseCompositeId(recordId);
        if (kind === 'MEETING') {
          const meeting = await this.prisma.meeting.findFirst({ where: { id, archivedAt: null } });
          if (!meeting) throw new NotFoundException('Meeting not found');
          await this.meetings.update(id, {
            title: this.string(values.title) ?? meeting.title,
            scheduledAt: values.dateAt !== undefined ? this.nullableDateString(values.dateAt) ?? meeting.scheduledAt.toISOString() : meeting.scheduledAt.toISOString(),
            status: this.enumValue(values.status, MeetingStatus) ?? meeting.status,
            projectId: meeting.projectId ?? undefined,
            heldAt: meeting.heldAt?.toISOString(),
            agenda: meeting.agenda ?? undefined,
            minutes: meeting.minutes ?? undefined,
            participantNames: meeting.participantNames,
          });
        } else if (kind === 'ACTION') {
          const action = await this.prisma.meetingAction.findFirst({ where: { id, archivedAt: null } });
          if (!action) throw new NotFoundException('Meeting action not found');
          await this.meetings.updateAction(action.meetingId, id, {
            ...(this.string(values.title) !== undefined ? { title: this.string(values.title)! } : {}),
            ...(this.enumValue(values.status, MeetingActionStatus) !== undefined ? { status: this.enumValue(values.status, MeetingActionStatus)! } : {}),
            ...(values.ownerName !== undefined ? { ownerName: this.nullableString(values.ownerName) } : {}),
            ...(values.dateAt !== undefined ? { dueAt: this.nullableDateString(values.dateAt) } : {}),
          });
        } else throw new BadRequestException('Meeting record id must include MEETING: or ACTION:');
        break;
      }
      case DataTableSource.DOCUMENTS:
        await this.documents.update(recordId, {
          ...(this.string(values.title) !== undefined ? { title: this.string(values.title)! } : {}),
          ...(Array.isArray(values.tags) ? { tags: values.tags.map(String) } : {}),
          ...(typeof values.isFavorite === 'boolean' ? { isFavorite: values.isFavorite } : {}),
          ...(values.projectId !== undefined ? { projectId: this.nullableString(values.projectId) } : {}),
        });
        break;
      case DataTableSource.RISKS_DECISIONS:
        await this.updateGovernance(recordId, values);
        break;
      default:
        throw new BadRequestException('Custom records are not handled by the system adapter');
    }
    const record = (await this.load(source)).find((candidate) => candidate.id === recordId);
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }

  private async load(source: DataTableSource): Promise<UnifiedDataRecord[]> {
    switch (source) {
      case DataTableSource.PROJECTS:
        return (await this.prisma.project.findMany({ where: { archivedAt: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] })).map((item) => ({
          id: item.id,
          values: this.pick(item, ['name', 'code', 'status', 'phase', 'leadName', 'plannedStartAt', 'plannedEndAt', 'updatedAt']),
          sourceType: 'PROJECT', sourceId: item.id, sourcePath: `/spaces/projects/${item.id}/overview`, createdAt: item.createdAt, updatedAt: item.updatedAt,
        }));
      case DataTableSource.WORK_TASKS:
        return (await this.prisma.workTask.findMany({ where: { archivedAt: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] })).map((item) => ({
          id: item.id,
          values: this.pick(item, ['title', 'status', 'priority', 'assigneeName', 'dueAt', 'projectId', 'description', 'updatedAt']),
          sourceType: 'WORK_TASK', sourceId: item.id, sourcePath: `/my-work?taskId=${item.id}`, createdAt: item.createdAt, updatedAt: item.updatedAt,
        }));
      case DataTableSource.MEETING_ACTIONS:
        return this.loadMeetingRecords();
      case DataTableSource.DOCUMENTS:
        return (await this.prisma.contentDocument.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] })).map((item) => ({
          id: item.id,
          values: this.pick(item, ['title', 'type', 'tags', 'isFavorite', 'projectId', 'spaceId', 'updatedAt']),
          sourceType: item.type === 'KNOWLEDGE_PAGE' ? 'KNOWLEDGE_PAGE' : 'DOCUMENT', sourceId: item.id, sourcePath: `/docs?documentId=${item.id}`, createdAt: item.createdAt, updatedAt: item.updatedAt,
        }));
      case DataTableSource.RISKS_DECISIONS:
        return this.loadGovernance();
      default:
        return [];
    }
  }

  private async loadGovernance(): Promise<UnifiedDataRecord[]> {
    const [risks, decisions] = await Promise.all([
      this.prisma.risk.findMany({ where: { archivedAt: null } }),
      this.prisma.decision.findMany({ where: { archivedAt: null } }),
    ]);
    return [
      ...risks.map((item) => ({
        id: `RISK:${item.id}`, values: { ...this.pick(item, ['title', 'status', 'level', 'ownerName', 'projectId', 'updatedAt']), recordType: 'RISK' }, sourceType: 'RISK', sourceId: item.id,
        sourcePath: this.governanceSourcePath('risks', item.id, item.projectId), createdAt: item.createdAt, updatedAt: item.updatedAt,
      })),
      ...decisions.map((item) => ({
        id: `DECISION:${item.id}`, values: { ...this.pick(item, ['title', 'status', 'projectId', 'participantNames', 'updatedAt']), recordType: 'DECISION' }, sourceType: 'DECISION', sourceId: item.id,
        sourcePath: this.governanceSourcePath('decisions', item.id, item.projectId), createdAt: item.createdAt, updatedAt: item.updatedAt,
      })),
    ].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  private async loadMeetingRecords(): Promise<UnifiedDataRecord[]> {
    const [meetings, actions] = await Promise.all([
      this.prisma.meeting.findMany({ where: { archivedAt: null } }),
      this.prisma.meetingAction.findMany({ where: { archivedAt: null }, include: { meeting: { select: { title: true } } } }),
    ]);
    return [
      ...meetings.map((item) => ({
        id: `MEETING:${item.id}`,
        values: { title: item.title, recordType: 'MEETING', status: item.status, ownerName: null, dateAt: item.scheduledAt, meetingTitle: item.title, taskId: null, updatedAt: item.updatedAt },
        sourceType: 'MEETING', sourceId: item.id, sourcePath: `/calendar?meetingId=${item.id}`, createdAt: item.createdAt, updatedAt: item.updatedAt,
      })),
      ...actions.map((item) => ({
        id: `ACTION:${item.id}`,
        values: { title: item.title, recordType: 'ACTION', status: item.status, ownerName: item.ownerName, dateAt: item.dueAt, meetingTitle: item.meeting.title, taskId: item.taskId, updatedAt: item.updatedAt },
        sourceType: 'MEETING_ACTION', sourceId: item.id, sourcePath: `/calendar?meetingId=${item.meetingId}`, createdAt: item.createdAt, updatedAt: item.updatedAt,
      })),
    ].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  private async updateGovernance(recordId: string, values: Values) {
    const separator = recordId.indexOf(':');
    const kind = separator > 0 ? recordId.slice(0, separator) : '';
    const id = separator > 0 ? recordId.slice(separator + 1) : recordId;
    if (kind === 'RISK') {
      const current = await this.prisma.risk.findFirst({ where: { id, archivedAt: null } });
      if (!current) throw new NotFoundException('Risk not found');
      await this.risks.update(id, {
        title: this.string(values.title) ?? current.title,
        likelihood: current.likelihood,
        impact: current.impact,
        level: this.enumValue(values.level, RiskLevel) ?? current.level,
        ...(this.enumValue(values.status, RiskStatus) !== undefined ? { status: this.enumValue(values.status, RiskStatus)! } : {}),
        ...(this.string(values.ownerName) !== undefined ? { ownerName: this.string(values.ownerName)! } : {}),
        ...(this.string(values.projectId) !== undefined ? { projectId: this.string(values.projectId)! } : {}),
      });
      return;
    }
    if (kind === 'DECISION') {
      const current = await this.prisma.decision.findFirst({ where: { id, archivedAt: null } });
      if (!current) throw new NotFoundException('Decision not found');
      await this.decisions.update(id, {
        title: this.string(values.title) ?? current.title,
        alternatives: Array.isArray(current.alternatives) ? current.alternatives.map(String) : [],
        ...(this.enumValue(values.status, DecisionStatus) !== undefined ? { status: this.enumValue(values.status, DecisionStatus)! } : {}),
        ...(this.string(values.projectId) !== undefined ? { projectId: this.string(values.projectId)! } : {}),
      });
      return;
    }
    throw new BadRequestException('Governance record id must include RISK: or DECISION:');
  }

  private applyQuery(records: UnifiedDataRecord[], query: RecordQuery) {
    const searched = query.query
      ? records.filter((record) => JSON.stringify(record.values).toLocaleLowerCase().includes(query.query!.toLocaleLowerCase()))
      : records;
    const filtered = query.filterField
      ? searched.filter((record) => String(record.values[query.filterField!] ?? '') === String(query.filterValue ?? ''))
      : searched;
    const sorted = query.sortField
      ? [...filtered].sort((left, right) => this.compare(left.values[query.sortField!], right.values[query.sortField!], query.sortOrder))
      : filtered;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 100;
    return { data: sorted.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: sorted.length } };
  }

  private compare(left: unknown, right: unknown, order: 'asc' | 'desc' = 'asc') {
    const direction = order === 'desc' ? -1 : 1;
    return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN', { numeric: true }) * direction;
  }

  private pick<T extends object>(source: T, keys: string[]) {
    return Object.fromEntries(keys.map((key) => [key, (source as Record<string, unknown>)[key]]));
  }

  private governanceSourcePath(kind: 'risks' | 'decisions', recordId: string, projectId: string | null) {
    const params = new URLSearchParams({ recordId });
    if (projectId) params.set('projectId', projectId);
    return `/library/governance/${kind}?${params.toString()}`;
  }

  private string(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
  private nullableString(value: unknown) { return value === null || value === '' ? null : this.string(value); }
  private nullableDateString(value: unknown) {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) throw new BadRequestException('Invalid date value');
    return new Date(value).toISOString();
  }
  private dateString(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    return this.nullableDateString(value) ?? undefined;
  }
  private parseCompositeId(recordId: string): [string, string] {
    const separator = recordId.indexOf(':');
    return separator > 0 ? [recordId.slice(0, separator), recordId.slice(separator + 1)] : ['', recordId];
  }
  private assertWritable(source: DataTableSource, recordId: string, values: Values) {
    let allowed: ReadonlySet<string>;
    let nullable = new Set<string>();
    if (source === DataTableSource.MEETING_ACTIONS) {
      const [kind] = this.parseCompositeId(recordId);
      if (kind !== 'MEETING' && kind !== 'ACTION') throw new BadRequestException('Meeting record id must include MEETING: or ACTION:');
      allowed = kind === 'MEETING' ? MEETING_WRITABLE_KEYS : ACTION_WRITABLE_KEYS;
      if (kind === 'ACTION') nullable = new Set(['ownerName', 'dateAt']);
    } else if (source === DataTableSource.RISKS_DECISIONS) {
      const [kind] = this.parseCompositeId(recordId);
      if (kind !== 'RISK' && kind !== 'DECISION') throw new BadRequestException('Governance record id must include RISK: or DECISION:');
      allowed = kind === 'RISK' ? RISK_WRITABLE_KEYS : DECISION_WRITABLE_KEYS;
    } else if (source === DataTableSource.CUSTOM) {
      throw new BadRequestException('Custom records are not handled by the system adapter');
    } else {
      allowed = WRITABLE_KEYS[source];
      if (source === DataTableSource.DOCUMENTS) nullable = new Set(['projectId']);
    }
    const readonly = Object.keys(values).filter((key) => !allowed.has(key));
    if (readonly.length) throw new BadRequestException(`Fields are read-only for this record: ${readonly.join(', ')}`);
    const unsupportedEmpty = Object.entries(values)
      .filter(([key, value]) => (value === null || value === undefined || value === '') && !nullable.has(key))
      .map(([key]) => key);
    if (unsupportedEmpty.length) throw new BadRequestException(`Fields cannot be cleared for this record: ${unsupportedEmpty.join(', ')}`);
  }
  private enumValue<T extends Record<string, string>>(value: unknown, enumeration: T): T[keyof T] | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !Object.values(enumeration).includes(value)) throw new BadRequestException(`Invalid enum value: ${String(value)}`);
    return value as T[keyof T];
  }
}
