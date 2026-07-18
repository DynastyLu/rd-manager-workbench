import { DataFieldType as F, DataTableSource as S, DataViewType as V } from '@prisma/client';
import { PresetDefinition } from './base.types';

const options = (values: string[]) => ({ options: values.map((value) => ({ label: value, value })) });

export const DATA_TABLE_PRESETS: PresetDefinition[] = [
  {
    key: 'projects', name: '项目总表', description: '实时汇总所有项目，不产生数据副本', icon: 'project', source: S.PROJECTS,
    fields: [
      { key: 'name', name: '项目名称', type: F.TEXT, isPrimary: true, sequence: 0 },
      { key: 'code', name: '项目编号', type: F.TEXT, sequence: 1 },
      { key: 'status', name: '状态', type: F.SINGLE_SELECT, config: options(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']), sequence: 2 },
      { key: 'phase', name: '阶段', type: F.SINGLE_SELECT, config: options(['DISCOVERY', 'PLANNING', 'RESEARCH', 'DEVELOPMENT', 'VALIDATION', 'DELIVERY']), sequence: 3 },
      { key: 'leadName', name: '负责人', type: F.TEXT, sequence: 4 },
      { key: 'plannedStartAt', name: '计划开始', type: F.DATETIME, sequence: 5 },
      { key: 'plannedEndAt', name: '计划结束', type: F.DATETIME, sequence: 6 },
      { key: 'updatedAt', name: '更新时间', type: F.UPDATED_AT, sequence: 7 },
    ],
    views: [
      { name: '全部项目', type: V.GRID, isDefault: true, sequence: 0 },
      { name: '项目看板', type: V.KANBAN, config: { groupField: 'status' }, sequence: 1 },
      { name: '项目日历', type: V.CALENDAR, config: { dateField: 'plannedEndAt' }, sequence: 2 },
    ],
  },
  {
    key: 'work-tasks', name: '任务总表', description: '与我的工作和日历共享同一条任务', icon: 'task', source: S.WORK_TASKS,
    fields: [
      { key: 'title', name: '任务', type: F.TEXT, isPrimary: true, sequence: 0 },
      { key: 'status', name: '状态', type: F.SINGLE_SELECT, config: options(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']), sequence: 1 },
      { key: 'priority', name: '优先级', type: F.SINGLE_SELECT, config: options(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), sequence: 2 },
      { key: 'assigneeName', name: '负责人', type: F.TEXT, sequence: 3 },
      { key: 'dueAt', name: '截止时间', type: F.DATETIME, sequence: 4 },
      { key: 'projectId', name: '关联项目', type: F.RELATION, config: { target: 'projects' }, sequence: 5 },
      { key: 'description', name: '说明', type: F.LONG_TEXT, sequence: 6 },
      { key: 'updatedAt', name: '更新时间', type: F.UPDATED_AT, sequence: 7 },
    ],
    views: [
      { name: '全部任务', type: V.GRID, isDefault: true, sequence: 0 },
      { name: '任务看板', type: V.KANBAN, config: { groupField: 'status' }, sequence: 1 },
      { name: '任务日历', type: V.CALENDAR, config: { dateField: 'dueAt' }, sequence: 2 },
    ],
  },
  {
    key: 'meeting-actions', name: '会议与行动项', description: '统一查看会议和会议结论后的执行事项', icon: 'meeting', source: S.MEETING_ACTIONS,
    fields: [
      { key: 'title', name: '会议 / 行动项', type: F.TEXT, isPrimary: true, sequence: 0 },
      { key: 'recordType', name: '类型', type: F.SINGLE_SELECT, config: options(['MEETING', 'ACTION']), sequence: 1 },
      { key: 'status', name: '状态', type: F.SINGLE_SELECT, sequence: 2 },
      { key: 'ownerName', name: '负责人', type: F.TEXT, sequence: 3 },
      { key: 'dateAt', name: '会议 / 截止时间', type: F.DATETIME, sequence: 4 },
      { key: 'meetingTitle', name: '所属会议', type: F.RELATION, sequence: 5 },
      { key: 'taskId', name: '关联任务', type: F.RELATION, sequence: 6 },
      { key: 'updatedAt', name: '更新时间', type: F.UPDATED_AT, sequence: 7 },
    ],
    views: [
      { name: '全部行动项', type: V.GRID, isDefault: true, sequence: 0 },
      { name: '执行看板', type: V.KANBAN, config: { groupField: 'status' }, sequence: 1 },
      { name: '会议日历', type: V.CALENDAR, config: { dateField: 'dateAt' }, sequence: 2 },
    ],
  },
  {
    key: 'documents', name: '文档与知识', description: '统一查看文档、知识页和会议纪要', icon: 'document', source: S.DOCUMENTS,
    fields: [
      { key: 'title', name: '标题', type: F.TEXT, isPrimary: true, sequence: 0 },
      { key: 'type', name: '类型', type: F.SINGLE_SELECT, config: options(['DOCUMENT', 'KNOWLEDGE_PAGE', 'MEETING_MINUTES']), sequence: 1 },
      { key: 'tags', name: '标签', type: F.MULTI_SELECT, sequence: 2 },
      { key: 'isFavorite', name: '收藏', type: F.CHECKBOX, sequence: 3 },
      { key: 'projectId', name: '关联项目', type: F.RELATION, sequence: 4 },
      { key: 'updatedAt', name: '更新时间', type: F.UPDATED_AT, sequence: 5 },
    ],
    views: [{ name: '全部内容', type: V.GRID, isDefault: true, sequence: 0 }],
  },
  {
    key: 'risks-decisions', name: '风险与决策', description: '将项目风险和关键决策放在一个治理视图', icon: 'governance', source: S.RISKS_DECISIONS,
    fields: [
      { key: 'title', name: '标题', type: F.TEXT, isPrimary: true, sequence: 0 },
      { key: 'recordType', name: '类型', type: F.SINGLE_SELECT, config: options(['RISK', 'DECISION']), sequence: 1 },
      { key: 'status', name: '状态', type: F.SINGLE_SELECT, sequence: 2 },
      { key: 'level', name: '风险等级', type: F.SINGLE_SELECT, config: options(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), sequence: 3 },
      { key: 'ownerName', name: '负责人', type: F.TEXT, sequence: 4 },
      { key: 'projectId', name: '关联项目', type: F.RELATION, sequence: 5 },
      { key: 'updatedAt', name: '更新时间', type: F.UPDATED_AT, sequence: 6 },
    ],
    views: [
      { name: '治理总表', type: V.GRID, isDefault: true, sequence: 0 },
      { name: '状态看板', type: V.KANBAN, config: { groupField: 'status' }, sequence: 1 },
    ],
  },
];
