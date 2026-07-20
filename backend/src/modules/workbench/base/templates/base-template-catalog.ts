import { DataFieldType as F, DataViewType as V } from '@prisma/client';
import { DataTableTemplateDefinition, TemplateFieldDefinition } from './base-template.types';
import { deepFreezeTemplateCatalog, validateTemplateCatalog } from './base-template-validator';

const colors = ['blue', 'green', 'orange', 'red', 'purple', 'cyan'];
const options = (...labels: string[]) => ({
  options: labels.map((label, index) => ({
    label,
    value: label.toLocaleLowerCase().replace(/[\s/]+/g, '_'),
    color: colors[index % colors.length],
  })),
});
const field = (
  key: string,
  name: string,
  type: F,
  sequence: number,
  config?: Record<string, unknown>,
  flags: Pick<TemplateFieldDefinition, 'isPrimary' | 'isRequired'> = {},
): TemplateFieldDefinition => ({ key, name, type, sequence, ...(config ? { config } : {}), ...flags });
const projectRelation = { targetPresetKey: 'projects', multiple: false, relationMode: 'ONE_WAY' };

export const BASE_TEMPLATE_CATALOG: DataTableTemplateDefinition[] = [
  {
    key: 'partner-ledger', version: 1, name: '合作方台账', description: '集中管理合作状态、联系人、协议和沟通节奏', icon: '🤝', category: 'PARTNER',
    fields: [
      field('partner_name', '合作方名称', F.TEXT, 0, undefined, { isPrimary: true, isRequired: true }),
      field('partner_type', '类型', F.SINGLE_SELECT, 1, options('高校', '企业', '研究院', '供应商', '其他')),
      field('cooperation_status', '合作状态', F.SINGLE_SELECT, 2, options('待接触', '洽谈中', '合作中', '暂停', '已结束')),
      field('contact_name', '联系人', F.TEXT, 3), field('phone', '手机号', F.TEXT, 4), field('email', '邮箱', F.TEXT, 5),
      field('project', '关联项目', F.RELATION, 6, projectRelation), field('agreement_expires_at', '协议到期日', F.DATETIME, 7),
      field('next_contact_at', '下次沟通日', F.DATETIME, 8), field('cooperation_content', '合作内容', F.LONG_TEXT, 9),
      field('notes', '备注', F.LONG_TEXT, 10), field('created_at', '创建时间', F.CREATED_AT, 11),
    ],
    views: [
      { name: '全部合作方', type: V.GRID, config: {}, isDefault: true, sequence: 0 },
      { name: '按合作状态', type: V.KANBAN, config: { groupField: 'cooperation_status' }, sequence: 1 },
      { name: '协议到期', type: V.CALENDAR, config: { dateField: 'agreement_expires_at' }, sequence: 2 },
      { name: '下次沟通', type: V.CALENDAR, config: { dateField: 'next_contact_at' }, sequence: 3 },
    ],
  },
  {
    key: 'rd-application', version: 1, name: '研发申报', description: '跟踪申报阶段、材料准备、补正与提交节点', icon: '📮', category: 'APPLICATION',
    fields: [
      field('application_title', '申报事项', F.TEXT, 0, undefined, { isPrimary: true, isRequired: true }),
      field('application_type', '申报类型', F.SINGLE_SELECT, 1, options('项目', '专利', '奖项', '标准', '资质')),
      field('stage', '阶段', F.SINGLE_SELECT, 2, options('线索', '准备', '内审', '提交', '答辩', '结项')),
      field('status', '状态', F.SINGLE_SELECT, 3, options('未开始', '进行中', '受阻', '已完成', '已取消')),
      field('owner', '负责人', F.TEXT, 4), field('project', '关联项目', F.RELATION, 5, projectRelation),
      field('planned_start_at', '计划开始', F.DATETIME, 6), field('planned_submit_at', '计划提交', F.DATETIME, 7),
      field('materials', '材料清单', F.LONG_TEXT, 8), field('correction', '补正内容', F.LONG_TEXT, 9),
      field('submission_log', '提交记录', F.LONG_TEXT, 10), field('notes', '备注', F.LONG_TEXT, 11), field('updated_at', '更新时间', F.UPDATED_AT, 12),
    ],
    views: [
      { name: '申报总表', type: V.GRID, config: {}, isDefault: true, sequence: 0 },
      { name: '按阶段', type: V.KANBAN, config: { groupField: 'stage' }, sequence: 1 },
      { name: '提交日历', type: V.CALENDAR, config: { dateField: 'planned_submit_at' }, sequence: 2 },
      { name: '申报甘特', type: V.GANTT, config: { titleFieldKey: 'application_title', startFieldKey: 'planned_start_at', endFieldKey: 'planned_submit_at', scale: 'WEEK' }, sequence: 3 },
    ],
  },
  {
    key: 'risk-register', version: 1, name: '风险台账', description: '识别、评估、跟踪并关闭研发风险', icon: '⚠️', category: 'GOVERNANCE',
    fields: [
      field('risk_title', '风险标题', F.TEXT, 0, undefined, { isPrimary: true, isRequired: true }),
      field('object_type', '对象类型', F.SINGLE_SELECT, 1, options('项目', '任务', '合作方', '非项目研发', '其他')),
      field('risk_level', '风险等级', F.SINGLE_SELECT, 2, options('低', '中', '高', '严重')),
      field('status', '状态', F.SINGLE_SELECT, 3, options('开放', '应对中', '观察中', '已关闭')),
      field('owner', '负责人', F.TEXT, 4), field('project', '关联项目', F.RELATION, 5, projectRelation),
      field('probability', '发生概率', F.NUMBER, 6), field('impact', '影响程度', F.NUMBER, 7),
      field('discovered_at', '发现日期', F.DATETIME, 8), field('planned_close_at', '计划关闭日', F.DATETIME, 9),
      field('response', '应对措施', F.LONG_TEXT, 10), field('closed_at', '关闭日期', F.DATETIME, 11), field('notes', '备注', F.LONG_TEXT, 12),
    ],
    views: [
      { name: '风险总表', type: V.GRID, config: {}, isDefault: true, sequence: 0 },
      { name: '按等级', type: V.KANBAN, config: { groupField: 'risk_level' }, sequence: 1 },
      { name: '按状态', type: V.KANBAN, config: { groupField: 'status' }, sequence: 2 },
      { name: '关闭日历', type: V.CALENDAR, config: { dateField: 'planned_close_at' }, sequence: 3 },
    ],
  },
  {
    key: 'interview-tracker', version: 1, name: '面试候选跟踪', description: '从初筛到录用统一管理候选人和面试反馈', icon: '🧑‍💻', category: 'INTERVIEW',
    fields: [
      field('candidate_name', '候选人', F.TEXT, 0, undefined, { isPrimary: true, isRequired: true }),
      field('position', '岗位', F.TEXT, 1), field('interview_stage', '面试阶段', F.SINGLE_SELECT, 2, options('初筛', '一面', '二面', '终面', 'HR面')),
      field('candidate_status', '候选状态', F.SINGLE_SELECT, 3, options('待联系', '面试中', '待决定', '已录用', '已淘汰', '已放弃')),
      field('score', '评分', F.NUMBER, 4), field('interviewer', '面试官', F.TEXT, 5), field('interview_at', '面试时间', F.DATETIME, 6),
      field('conclusion', '面试结论', F.LONG_TEXT, 7), field('resume_link', '简历链接', F.LINK, 8),
      field('profile', '头像/资料附件', F.ATTACHMENT, 9), field('notes', '备注', F.LONG_TEXT, 10), field('updated_at', '更新时间', F.UPDATED_AT, 11),
    ],
    views: [
      { name: '候选人总表', type: V.GRID, config: {}, isDefault: true, sequence: 0 },
      { name: '按阶段', type: V.KANBAN, config: { groupField: 'interview_stage' }, sequence: 1 },
      { name: '面试日历', type: V.CALENDAR, config: { dateField: 'interview_at' }, sequence: 2 },
      { name: '候选人画册', type: V.GALLERY, config: { titleFieldKey: 'candidate_name', coverFieldKey: 'profile', cardSize: 'STANDARD' }, sequence: 3 },
    ],
  },
  {
    key: 'non-project-rd', version: 1, name: '非项目研发记录', description: '管理技术探索、平台建设、技术债和临时支撑', icon: '🧪', category: 'RESEARCH',
    fields: [
      field('item_name', '事项名称', F.TEXT, 0, undefined, { isPrimary: true, isRequired: true }),
      field('category', '类别', F.SINGLE_SELECT, 1, options('技术探索', '新方向', '平台工具', '技术债', '专利标准', '培训', '临时支撑')),
      field('status', '状态', F.SINGLE_SELECT, 2, options('草稿', '已计划', '进行中', '暂停', '已完成', '已取消')),
      field('priority', '优先级', F.SINGLE_SELECT, 3, options('低', '中', '高', '紧急')), field('owner', '负责人', F.TEXT, 4),
      field('start_at', '开始日期', F.DATETIME, 5), field('end_at', '结束日期', F.DATETIME, 6), field('completion', '完成百分比', F.NUMBER, 7),
      field('outcome_link', '成果链接', F.LINK, 8), field('retrospective', '复盘记录', F.LONG_TEXT, 9), field('notes', '备注', F.LONG_TEXT, 10), field('updated_at', '更新时间', F.UPDATED_AT, 11),
    ],
    views: [
      { name: '研发事项总表', type: V.GRID, config: {}, isDefault: true, sequence: 0 },
      { name: '按状态', type: V.KANBAN, config: { groupField: 'status' }, sequence: 1 },
      { name: '计划甘特', type: V.GANTT, config: { titleFieldKey: 'item_name', startFieldKey: 'start_at', endFieldKey: 'end_at', scale: 'WEEK' }, sequence: 2 },
      { name: '结束日历', type: V.CALENDAR, config: { dateField: 'end_at' }, sequence: 3 },
    ],
  },
];

let validated: readonly DataTableTemplateDefinition[] | undefined;
export function getValidatedTemplateCatalog() {
  validated ??= deepFreezeTemplateCatalog(validateTemplateCatalog(BASE_TEMPLATE_CATALOG));
  return validated;
}
