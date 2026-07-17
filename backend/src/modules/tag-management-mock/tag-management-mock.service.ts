/**
 * 标签管理文档接口的有状态内存 Mock。
 * 数据结构和过滤语义模拟真实接口，供前端独立联调；不承担生产持久化职责。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface DictionaryPayload {
  raidoCheckDicInfo: Record<string, DictionaryItem[]>;
  treeDic: Record<string, DictionaryItem[]>;
}

interface DictionaryItem {
  id?: string | null;
  name: string;
  value: string;
  pId?: string | null;
  pid?: string | null;
  classType?: string | null;
  showType?: string | null;
}

interface EditDictionaryFile {
  data?: Record<string, DictionarySourceItem[]>;
}

interface SearchDictionaryFile {
  data?: DictionaryPayload;
}

interface CategoryFixtureFile {
  data?: CategoryBean[];
}

interface DictionarySourceItem extends Record<string, unknown> {
  classType?: string | null;
  id?: string | null;
  name?: string | null;
  pId?: string | null;
  pid?: string | null;
  showType?: string | null;
  value?: string | null;
}

interface CategoryBean {
  classAttach: string;
  classType: string;
  createRole: string;
  createTime: number;
  creator: string;
  desc: string;
  filter: number;
  id: string;
  labelCount: number;
  level: number;
  multiSelect: number;
  name: string;
  pId: string;
  registerItem: number;
  registerRequired: number;
  sort: number;
  state: number;
  updateTime: number;
  updator: string;
}

interface LabelInfo {
  categoryDetails: Record<string, LabelCategoryDetail>;
  categoryIds: string;
  creatDepart: string;
  creator: string;
  desc: string;
  labelAlias: string;
  labelCode: string;
  labelEnName: string;
  labelName: string;
  labelType: number;
  labelTypeName: string;
  resultCount: number;
  shareTypeName: string;
  shareattr: number;
  state: number;
  stateName: string;
  version: string;
  createRole: string;
  personInput: string;
  personDeal: string;
  personOutput: string;
  period: string;
  resource: string;
}

interface LabelCategoryDetail {
  cateCode: string;
  cateFullName: string;
}

interface AuditInfo {
  auditId: string;
  bcontent: string;
  desc: string;
  labelCode: string;
  labelName: string;
  labelStatus: string;
  labelType: number;
  labelTypeValue: string;
  rcontent: string;
  result: string;
  shareAttr: number;
  shareAttrValue: string;
  state: number;
  stateValue: string;
  status: number;
  statusValue: string;
}

type AuditListType = 'apply' | 'audit';

interface InternalAuditInfo extends AuditInfo {
  listTypes: AuditListType[];
  permissionIntent?: 0 | 1;
}

interface RoleInfo {
  realmCode: string;
  realmInfo: string;
  realmName: string;
  sortNum: number;
}

interface DataResourceInfo {
  datasourceIdentifier: string;
  name: string;
  tableName: string;
}

interface ResultRecord {
  atttype: string;
  attvl: string;
  ftime: string;
  lab: string;
  ltime: string;
  source: string;
}

interface CategoryMutationInput {
  cateCode?: unknown;
  labelCodes?: unknown;
}

interface AuthorityMutationInput {
  labelCodes?: unknown;
  roleCodes?: unknown;
}

interface AuditReviewInput {
  auditIds?: unknown;
  bcontent?: unknown;
  result?: unknown;
  status?: unknown;
}

interface ApplyLabelPermissionInput {
  labelCodes?: unknown;
  roleCodes?: unknown;
  vaild?: unknown;
  validUntil?: unknown;
}

interface DictionaryRequestInput {
  level?: unknown;
}

interface LabelMutationInput {
  categorys?: unknown;
  createRole?: unknown;
  desc?: unknown;
  labelEnName?: unknown;
  labelalias?: unknown;
  labelcode?: unknown;
  labelname?: unknown;
  labeltype?: unknown;
  period?: unknown;
  personDeal?: unknown;
  personInput?: unknown;
  personOutput?: unknown;
  resource?: unknown;
  shareAttr?: unknown;
  state?: unknown;
  version?: unknown;
}

interface UpdateCategoryInput {
  categoryId?: unknown;
  desc?: unknown;
  filter?: unknown;
  name?: unknown;
  registerItem?: unknown;
  registerRequired?: unknown;
}

interface PaginationInput {
  nowPage?: unknown;
  pageSize?: unknown;
}

interface LabelInfoSearchInput extends PaginationInput {
  categoryRecursion?: unknown;
  categorys?: unknown;
  labelType?: unknown;
  roleCodes?: unknown;
  roleFilterType?: unknown;
  searchKey?: unknown;
  shareType?: unknown;
  state?: unknown;
  viewCode?: unknown;
}

interface AuditListInput extends PaginationInput {
  labelStatus?: unknown;
  searchWord?: unknown;
}

interface LoginAccountInput {
  loginName?: unknown;
  password?: unknown;
}

interface ResultSearchInput extends PaginationInput {
  attrValue?: unknown;
  roleCode?: unknown;
}

const statusNameMap = new Map<number, string>([
  [0, '新建'],
  [1, '待审核'],
  [2, '审核通过'],
  [3, '驳回'],
  [4, '上线'],
  [5, '暂停'],
  [6, '下线'],
]);

const auditStatusNameMap = new Map<number, string>([
  [21, '通过'],
  [22, '驳回'],
  [23, '已撤回'],
  [24, '未审核'],
]);

const typeNameMap = new Map<number, string>([
  [0, '布尔标签'],
  [1, '数值标签'],
  [2, '数字标签'],
  [3, '字符标签'],
]);

const shareNameMap = new Map<number, string>([
  [14, '角色私有'],
  [15, '公开'],
  [16, '有条件公开'],
]);

@Injectable()
export class TagManagementMockService {
  private generatedLabelSequence = 0;
  private readonly dictionaryPayload = this.loadDictionaryPayload();
  private readonly editDictionaryPayload = this.loadEditDictionaryPayload();
  private readonly suppliedChildCategories = new Map<string, CategoryBean[]>([
    ['013', this.loadCategoryFixture('child-categories-013.json')],
  ]);
  private readonly labels: LabelInfo[] = createLabels();
  private readonly audits: InternalAuditInfo[] = createAudits(this.labels);
  private readonly roles: RoleInfo[] = createRoles();
  private readonly resultRecords: ResultRecord[] = createResultRecords();
  private readonly dataResources: DataResourceInfo[] = createDataResources();
  private readonly categoriesByParent = this.createCategoryStore();
  /** 角色到标签编码的授权关系；角色切换不改变分类下的标签集合。 */
  private readonly rolePermissions = new Map<string, Set<string>>([
    ['620000103', new Set(['ZB000004', 'ZA005993', 'ZA005992', 'ZA005988'])],
    ['420100101', new Set(['ZA005988', 'ZA005987'])],
  ]);

  dictionary(body: DictionaryRequestInput) {
    return body.level === 'edit' ? this.editDictionaryPayload : this.dictionaryPayload;
  }

  labelSearchDictionary() {
    return this.dictionaryPayload;
  }

  labelEditDictionary() {
    return this.editDictionaryPayload;
  }

  parentCategoryInfo() {
    return this.categoriesByParent.get('0') ?? [];
  }

  childCategoryInfo(parentId: string) {
    const normalizedParentId = normalizeCategoryId(parentId);
    return (
      this.suppliedChildCategories.get(normalizedParentId) ??
      this.descendantCategories(normalizedParentId)
    );
  }

  labelCategoryInfo() {
    return this.parentCategoryInfo();
  }

  categoryChildsInfo(parentId: string) {
    return this.descendantCategories(normalizeCategoryId(parentId));
  }

  updateCategory(body: UpdateCategoryInput) {
    const categoryId = normalizeCategoryId(String(body.categoryId ?? ''));
    const category = this.findCategory(categoryId);
    if (!category) return false;
    category.name = String(body.name ?? category.name);
    category.desc = String(body.desc ?? category.desc);
    category.filter = toNumber(body.filter, category.filter);
    category.registerItem = toNumber(body.registerItem, category.registerItem);
    category.registerRequired = toNumber(body.registerRequired, category.registerRequired);
    category.updateTime = Date.now();
    category.updator = 'admin';
    return true;
  }

  connectCategory(body: CategoryMutationInput) {
    const categoryId = normalizeCategoryId(String(body.cateCode ?? ''));
    const labelCodes = splitCodes(body.labelCodes);
    if (!categoryId || labelCodes.length === 0) return false;

    labelCodes.forEach((labelCode) => {
      const label = this.findLabel(labelCode);
      if (!label) return;
      const categoryIds = new Set(splitCodes(label.categoryIds).map(normalizeCategoryId));
      categoryIds.add(categoryId);
      label.categoryIds = Array.from(categoryIds).join(',');
      label.categoryDetails = this.categoryDetailsFromIds(label.categoryIds);
    });
    return true;
  }

  disconnectCategory(body: CategoryMutationInput) {
    const categoryId = normalizeCategoryId(String(body.cateCode ?? ''));
    const labelCodes = splitCodes(body.labelCodes);
    if (!categoryId || labelCodes.length === 0) return false;

    labelCodes.forEach((labelCode) => {
      const label = this.findLabel(labelCode);
      if (!label) return;
      const categoryIds = splitCodes(label.categoryIds)
        .map(normalizeCategoryId)
        .filter((id) => id !== categoryId);
      label.categoryIds = categoryIds.join(',');
      label.categoryDetails = this.categoryDetailsFromIds(label.categoryIds);
    });
    return true;
  }

  categoryLabelInfo(body: LabelInfoSearchInput) {
    return this.labelInfo(body);
  }

  private categories(body: Record<string, unknown>) {
    const parentId = String(body.parentId ?? '0');
    const normalizedParentId = normalizeCategoryId(parentId || '0');
    const returnSelf = Number(body.returnSelf ?? 0);
    const searchKey = String(body.searchKey ?? '').trim();

    if (normalizedParentId === '0' || !normalizedParentId) {
      return this.filterCategories(this.categoriesByParent.get('0') ?? [], searchKey);
    }

    const children = this.filterCategories(
      this.categoriesByParent.get(normalizedParentId) ?? [],
      searchKey,
    );

    if (returnSelf === 1) {
      const self =
        this.findCategory(normalizedParentId) ??
        this.categoryBean(normalizedParentId, normalizedParentId, '0', 1, 0);
      return [self, ...children];
    }

    return children;
  }

  authorityRoleList(body: Record<string, unknown> = {}) {
    return this.roleList(body);
  }

  authorityParentCategoryInfo() {
    return this.parentCategoryInfo();
  }

  authorityChildCategoryInfo(parentId: string) {
    return this.childCategoryInfo(parentId);
  }

  authorityLabelInfo(body: LabelInfoSearchInput) {
    return this.labelInfo(body);
  }

  addAuthority(body: AuthorityMutationInput) {
    const labelCodes = splitCodes(body.labelCodes);
    const roleCodes = splitCodes(body.roleCodes);
    if (labelCodes.length === 0 || roleCodes.length === 0) return false;

    roleCodes.forEach((roleCode) => {
      const set = this.rolePermissions.get(roleCode) ?? new Set<string>();
      labelCodes.forEach((labelCode) => set.add(labelCode));
      this.rolePermissions.set(roleCode, set);
    });
    return true;
  }

  deleteAuthority(body: AuthorityMutationInput) {
    const labelCodes = splitCodes(body.labelCodes);
    const roleCodes = splitCodes(body.roleCodes);
    if (labelCodes.length === 0 || roleCodes.length === 0) return false;

    roleCodes.forEach((roleCode) => {
      const set = this.rolePermissions.get(roleCode);
      labelCodes.forEach((labelCode) => set?.delete(labelCode));
    });
    return true;
  }

  applyLabelPermission(body: ApplyLabelPermissionInput) {
    const labelCodes = splitCodes(body.labelCodes);
    const roleCodes = splitCodes(body.roleCodes);
    if (labelCodes.length === 0 || roleCodes.length === 0) return false;

    const permissionIntent = toNumber(body.vaild, 1) === 0 ? 0 : 1;
    labelCodes.forEach((labelCode) => {
      this.audits.unshift(
        this.createAudit({
          bcontent: roleCodes.join(','),
          labelCode,
          labelStatus: permissionIntent === 1 ? '申请使用权限' : '取消使用权限',
          listTypes: ['apply', 'audit'],
          permissionIntent,
          status: 24,
        }),
      );
    });
    return true;
  }

  applyStateSs(labelCode: string) {
    // 只有“新建”标签可以送审，重复送审或其他状态必须失败。
    const label = this.findLabel(labelCode);
    if (!label || label.state !== 0) return false;
    label.state = 1;
    label.stateName = statusNameMap.get(1) ?? '待审核';
    this.audits.unshift(
      this.createAudit({
        labelCode,
        labelStatus: '标签新增申请',
        listTypes: ['audit'],
        status: 24,
      }),
    );
    return true;
  }

  delLabel(labelCode: string) {
    const index = this.labels.findIndex((label) => label.labelCode === labelCode);
    if (index < 0) return false;
    // 文档流程只允许删除新建、暂停和下线标签。
    if (![0, 5, 6].includes(this.labels[index].state)) return false;
    this.labels.splice(index, 1);
    this.audits.forEach((audit) => {
      if (audit.labelCode === labelCode) audit.listTypes = [];
    });
    this.rolePermissions.forEach((set) => set.delete(labelCode));
    return true;
  }

  labelDetail(labelCode: string) {
    const label = this.findLabel(labelCode);
    if (!label) return null;
    const categoryIds = splitCodes(label.categoryIds).map(normalizeCategoryId);
    const category = (id: string) => this.findCategory(id);
    const categoryFor = (rootId: string) =>
      categoryIds
        .map(category)
        .find((item): item is CategoryBean => Boolean(item && this.isCategoryUnder(item, rootId)));
    return {
      categoryDetailRet: {
        dbsx: toDInfo(categoryFor('001')),
        fxjb: toDInfo(categoryFor('015')),
        gly: toDInfo(categoryFor('012')),
        tyfl: toDInfo(categoryFor('009')),
        ywy: toDInfo(categoryFor('003')),
        zyy: toDInfo(categoryFor('011')),
      },
      labelBean: {
        auditor: '',
        creatDepart: label.createRole,
        creatDepartName:
          this.roles.find((role) => role.realmCode === label.createRole)?.realmName ??
          label.creatDepart,
        createtime: 1650000000000,
        creator: label.creator,
        desc: label.desc,
        endtime: 0,
        isDepend: 0,
        isDependStr: '',
        istemp: 0,
        labelEnName: label.labelEnName,
        labelTag: '',
        labelValue: '',
        labelalias: label.labelAlias,
        labelcode: label.labelCode,
        labelname: label.labelName,
        labelnature: 0,
        labelnatureValue: '',
        labeltype: label.labelType,
        labeltypeStr: label.labelTypeName,
        language: '',
        object: '',
        resourceDepart: '',
        resourceDepartTrans: '',
        resourceSys: label.resource,
        resourceSysTrans: label.resource,
        shareAttr: label.shareattr,
        shareAttrValue: label.shareTypeName,
        starttime: 0,
        state: label.state,
        stateStr: label.stateName,
        subject: '',
        updateDepart: '',
        updatetime: 1650000000000,
        updator: 'admin',
        version: label.version,
      },
      labelRule: {
        createtime: 1650000000000,
        creator: label.creator,
        creatorDepart: label.createRole,
        edges: 0,
        edgesValue: '',
        labelcode: label.labelCode,
        period: label.period,
        personDeal: label.personDeal,
        personInput: label.personInput,
        personOutput: label.personOutput,
        resource: label.resource,
        ruleId: 1,
        state: 1,
        updatetime: 1650000000000,
        updator: 'admin',
        updatorDepart: label.createRole,
      },
    };
  }

  editLabel(body: LabelMutationInput) {
    const labelCode = String(body.labelcode ?? '');
    const existingIndex = this.labels.findIndex((item) => item.labelCode === labelCode);
    if (existingIndex < 0) return false;
    const updatedLabel = { ...this.labels[existingIndex] };

    if (body.categorys !== undefined) {
      updatedLabel.categoryIds = String(body.categorys);
      updatedLabel.categoryDetails = this.categoryDetailsFromIds(updatedLabel.categoryIds);
    }
    if (body.createRole !== undefined) {
      updatedLabel.createRole = String(body.createRole);
      updatedLabel.creatDepart = updatedLabel.createRole;
    }
    if (body.desc !== undefined) updatedLabel.desc = String(body.desc);
    if (body.labelEnName !== undefined) updatedLabel.labelEnName = String(body.labelEnName);
    if (body.labelalias !== undefined) updatedLabel.labelAlias = String(body.labelalias);
    if (body.labelname !== undefined) updatedLabel.labelName = String(body.labelname);
    if (body.labeltype !== undefined) {
      updatedLabel.labelType = toNumber(body.labeltype, updatedLabel.labelType);
      updatedLabel.labelTypeName =
        typeNameMap.get(updatedLabel.labelType) ?? updatedLabel.labelTypeName;
    }
    if (body.period !== undefined) updatedLabel.period = String(body.period);
    if (body.personDeal !== undefined) updatedLabel.personDeal = String(body.personDeal);
    if (body.personInput !== undefined) updatedLabel.personInput = String(body.personInput);
    if (body.personOutput !== undefined) updatedLabel.personOutput = String(body.personOutput);
    if (body.resource !== undefined) updatedLabel.resource = String(body.resource);
    if (body.shareAttr !== undefined) {
      updatedLabel.shareattr = toNumber(body.shareAttr, updatedLabel.shareattr);
      updatedLabel.shareTypeName =
        shareNameMap.get(updatedLabel.shareattr) ?? updatedLabel.shareTypeName;
    }
    if (body.state !== undefined) {
      updatedLabel.state = toNumber(body.state, updatedLabel.state);
      updatedLabel.stateName = statusNameMap.get(updatedLabel.state) ?? updatedLabel.stateName;
    }
    if (body.version !== undefined) updatedLabel.version = String(body.version);

    this.labels[existingIndex] = updatedLabel;
    return true;
  }

  onlineLabel(labelCode: string) {
    // 审核通过、暂停、下线均允许重新上线。
    return this.setLabelState(labelCode, 4, [2, 5, 6]);
  }

  offlineLabel(labelCode: string) {
    return this.setLabelState(labelCode, 6, [4, 5]);
  }

  suspendLabel(labelCode: string) {
    return this.setLabelState(labelCode, 5, [4]);
  }

  auditInfos(body: AuditListInput) {
    return this.listAudits(body, 'apply');
  }

  reviewInfos(body: AuditListInput) {
    return this.listAudits(body, 'audit');
  }

  auditReview(body: AuditReviewInput) {
    return this.reviewWithStatus(body, toNumber(body.status, 21));
  }

  myApplyReview(body: AuditReviewInput) {
    return this.reviewWithStatus(body, 23);
  }

  private listAudits(body: AuditListInput, targetListType: AuditListType) {
    const searchWord = String(body.searchWord ?? '').trim();
    const status =
      body.labelStatus === undefined || body.labelStatus === '' ? null : Number(body.labelStatus);
    const rows = this.audits.filter((audit) => {
      const matchedWord =
        !searchWord ||
        `${audit.labelCode}${audit.labelName}${audit.desc}`
          .toLowerCase()
          .includes(searchWord.toLowerCase());
      const matchedListType = audit.listTypes.includes(targetListType);
      const matchedStatus = status === null || audit.status === status;
      return matchedWord && matchedListType && matchedStatus;
    });
    return paginate(rows.map(toAuditResponse), body);
  }

  private reviewWithStatus(body: AuditReviewInput, status: number) {
    const auditIds = splitCodes(body.auditIds);
    if (auditIds.length === 0) return false;
    if (status === 22 && !String(body.result ?? '').trim()) return false;
    const uniqueAuditIds = new Set(auditIds);
    const selectedAudits = this.audits.filter((audit) => uniqueAuditIds.has(audit.auditId));
    // 仅待审核且全部存在的记录可以一次性审核，避免部分成功。
    if (
      selectedAudits.length !== uniqueAuditIds.size ||
      selectedAudits.some((audit) => audit.status !== 24)
    ) {
      return false;
    }

    selectedAudits.forEach((audit) => {
      audit.status = status;
      audit.statusValue = auditStatusNameMap.get(status) ?? '已审核';
      audit.result = String(body.result ?? audit.result);
      if (status === 21 && audit.permissionIntent !== undefined) {
        this.applyPermissionAudit(audit);
      }
      const label = this.findLabel(audit.labelCode);
      if (label && audit.labelStatus.includes('标签新增')) {
        const nextState = status === 21 ? 2 : status === 22 ? 3 : label.state;
        label.state = nextState;
        label.stateName = statusNameMap.get(nextState) ?? audit.statusValue;
      }
    });
    return true;
  }

  addLabel(body: LabelMutationInput) {
    const providedLabelCode = body.labelcode;
    if (
      providedLabelCode !== undefined &&
      (typeof providedLabelCode !== 'string' || providedLabelCode.trim().length === 0)
    ) {
      throw new BadRequestException('labelcode must not be blank');
    }
    const normalizedBody =
      typeof providedLabelCode === 'string'
        ? { ...body, labelcode: providedLabelCode.trim() }
        : { ...body, labelcode: this.generateLabelCode() };
    const label = this.toLabelInfo(normalizedBody);
    if (this.findLabel(label.labelCode)) return false;
    this.labels.unshift(label);
    return true;
  }

  labelInfo(body: LabelInfoSearchInput) {
    const searchKey = String(body.searchKey ?? '').trim();
    const labelType =
      body.labelType === undefined || body.labelType === '' ? null : Number(body.labelType);
    const shareType =
      body.shareType === undefined || body.shareType === '' ? null : Number(body.shareType);
    const state = body.state === undefined || body.state === '' ? null : Number(body.state);
    const roleCodes = splitCodes(body.roleCodes);
    const roleFilterTypeValue = body.roleFilterType;
    const roleFilterType =
      roleFilterTypeValue === undefined || roleFilterTypeValue === ''
        ? 0
        : Number(roleFilterTypeValue);
    if (!Number.isInteger(roleFilterType) || ![-1, 0, 1].includes(roleFilterType)) {
      throw new BadRequestException('roleFilterType must be one of -1, 0, or 1');
    }
    const categoryCodes = splitCodes(body.categorys).map(normalizeCategoryId);
    const categoryRecursion = toNumber(body.categoryRecursion, 0);
    // categoryRecursion=1 时父分类匹配其全部真实后代分类。
    const matchedCategoryCodes = new Set(
      categoryCodes.flatMap((code) => [
        code,
        ...(categoryRecursion === 1 ? this.descendantCategoryIds(code) : []),
      ]),
    );
    const rows = this.labels.filter((label) => {
      const matchedKeyword =
        !searchKey ||
        `${label.labelCode}${label.labelName}${label.labelAlias}${label.desc}`
          .toLowerCase()
          .includes(searchKey.toLowerCase());
      const matchedType = labelType === null || label.labelType === labelType;
      const matchedShare = shareType === null || label.shareattr === shareType;
      const matchedState = state === null || label.state === state;
      const labelCategoryCodes = splitCodes(label.categoryIds).map(normalizeCategoryId);
      const matchedCategory =
        matchedCategoryCodes.size === 0 ||
        labelCategoryCodes.some((code) => matchedCategoryCodes.has(code));
      const matchedRole = this.matchesRoleFilter(label, roleCodes, roleFilterType);
      return (
        matchedKeyword &&
        matchedType &&
        matchedShare &&
        matchedState &&
        matchedCategory &&
        matchedRole
      );
    });
    return paginate(rows.map(toLabelMetadataResponse), body);
  }

  accountLogin(body: LoginAccountInput) {
    const loginName = String(body.loginName ?? 'admin');
    return this.loginPayload(loginName, '管理员');
  }

  resultSearch(body: ResultSearchInput) {
    const attrValue = String(body.attrValue ?? '').trim();
    const roleCode = String(body.roleCode ?? '').trim();
    const rolePermissionCodes = roleCode ? this.rolePermissions.get(roleCode) : undefined;
    const rows = this.resultRecords.filter((record) => {
      const matchedValue =
        !attrValue || `${record.attvl}${record.lab}${record.source}`.includes(attrValue);
      if (!matchedValue) return false;
      if (!roleCode) return true;
      // 传角色时只返回该角色已授权标签对应的结果记录。
      const label = this.labels.find((item) => item.labelName === record.lab);
      return Boolean(label && rolePermissionCodes?.has(label.labelCode));
    });
    return paginate(rows, body);
  }

  resultOverview() {
    const labelCount = this.labels.filter((label) => label.state === 4).length;
    const resultCount = this.labels.reduce((total, label) => total + label.resultCount, 0);
    return {
      labelCount,
      resultCount,
      serviceBeUsedCount: 0,
      serviceBeUsedCountInWeek: 0,
      serviceModCount: 2,
      weekIncResult: 10,
      weekInclabel: 1,
    };
  }

  labelCodeResult(body: PaginationInput) {
    const rows = this.labels
      .filter((label) => label.resultCount > 0)
      .map((label) => ({
        labelCode: label.labelCode,
        labelName: label.labelName,
        totalCount: label.resultCount,
      }));
    return paginate(rows, body);
  }

  private roleList(body: Record<string, unknown>) {
    const realmName = String(body.realmName ?? '').trim();
    const rows = this.roles.filter((role) => !realmName || role.realmName.includes(realmName));
    return paginate(rows, body);
  }

  dataResourceList(searchKey = '') {
    const keyword = String(searchKey).trim().toLowerCase();
    return this.dataResources.filter((resource) => {
      if (!keyword) return true;
      return `${resource.datasourceIdentifier}${resource.name}${resource.tableName}`
        .toLowerCase()
        .includes(keyword);
    });
  }

  private categoryBean(
    id: string,
    name: string,
    pId: string,
    level: number,
    labelCount: number,
    sort = 0,
  ): CategoryBean {
    return {
      classAttach: '',
      classType: 'UNITAG',
      createRole: '',
      createTime: 1650000000000,
      creator: 'admin',
      desc: `${name}分类`,
      filter: 1,
      id,
      labelCount,
      level,
      multiSelect: 1,
      name,
      pId,
      registerItem: 1,
      registerRequired: 0,
      sort,
      state: 1,
      updateTime: 1650000000000,
      updator: 'admin',
    };
  }

  private findLabel(labelCode: string) {
    return this.labels.find((label) => label.labelCode === labelCode);
  }

  private generateLabelCode() {
    let labelCode: string;
    do {
      this.generatedLabelSequence += 1;
      labelCode = `ZM${String(this.generatedLabelSequence).padStart(8, '0')}`;
    } while (this.findLabel(labelCode));
    return labelCode;
  }

  private setLabelState(labelCode: string, state: number, allowedSourceStates: number[]) {
    // 所有状态变更先校验来源状态，禁止跳过送审/审核等中间流程。
    const label = this.findLabel(labelCode);
    if (!label || !allowedSourceStates.includes(label.state)) return false;
    label.state = state;
    label.stateName = statusNameMap.get(state) ?? '';
    return true;
  }

  private createAudit({
    bcontent = '',
    labelCode,
    labelStatus,
    listTypes,
    permissionIntent,
    status,
  }: {
    bcontent?: string;
    labelCode: string;
    labelStatus: string;
    listTypes: AuditListType[];
    permissionIntent?: 0 | 1;
    status: number;
  }): InternalAuditInfo {
    const label = this.findLabel(labelCode);
    return {
      auditId: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      bcontent,
      desc: label?.desc ?? '',
      labelCode,
      labelName: label?.labelName ?? labelCode,
      labelStatus,
      labelType: label?.labelType ?? 0,
      labelTypeValue: label?.labelTypeName ?? '布尔标签',
      rcontent: '',
      result: '',
      shareAttr: label?.shareattr ?? 15,
      shareAttrValue: label?.shareTypeName ?? '公开',
      state: label?.state ?? 1,
      stateValue: label?.stateName ?? '待审核',
      status,
      statusValue: auditStatusNameMap.get(status) ?? '未审核',
      listTypes,
      permissionIntent,
    };
  }

  private applyPermissionAudit(audit: InternalAuditInfo) {
    splitCodes(audit.bcontent).forEach((roleCode) => {
      if (audit.permissionIntent === 1) {
        const permissions = this.rolePermissions.get(roleCode) ?? new Set<string>();
        permissions.add(audit.labelCode);
        this.rolePermissions.set(roleCode, permissions);
        return;
      }
      this.rolePermissions.get(roleCode)?.delete(audit.labelCode);
    });
  }

  private findCategory(categoryId: string): CategoryBean | undefined {
    for (const rows of this.categoriesByParent.values()) {
      const match = rows.find((item) => item.id === categoryId);
      if (match) return match;
    }
    return undefined;
  }

  private isCategoryUnder(category: CategoryBean, rootId: string): boolean {
    let current: CategoryBean | undefined = category;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.id === rootId || current.pId === rootId) return true;
      visited.add(current.id);
      current = this.findCategory(current.pId);
    }
    return false;
  }

  private filterCategories(categories: CategoryBean[], searchKey: string) {
    if (!searchKey) return categories;
    return categories.filter((item) =>
      `${item.name}${item.desc}${item.id}`.toLowerCase().includes(searchKey.toLowerCase()),
    );
  }

  private categoryDetailsFromIds(categoryIds: string) {
    const categoryIdList = splitCodes(categoryIds).map(normalizeCategoryId);
    const ids = categoryIdList.length ? categoryIdList : ['003001'];
    return Object.fromEntries(
      ids.map((id) => {
        const category = this.findCategory(id);
        return [
          id,
          {
            cateCode: id,
            cateFullName: category ? this.categoryPath(category).join('/') : '业务域/诈骗',
          },
        ];
      }),
    );
  }

  private descendantCategoryIds(categoryId: string): string[] {
    return this.descendantCategories(categoryId).map((category) => category.id);
  }

  /** 子类接口与线上一致：一次返回该父类下全部后代，层级关系由 pId 表达。 */
  private descendantCategories(categoryId: string, ancestors = new Set<string>()): CategoryBean[] {
    if (ancestors.has(categoryId)) return [];
    const nextAncestors = new Set(ancestors).add(categoryId);
    const children = this.categoriesByParent.get(categoryId) ?? [];
    return children.flatMap((child) => [
      child,
      ...this.descendantCategories(child.id, nextAncestors),
    ]);
  }

  private categoryPath(category: CategoryBean): string[] {
    if (!category.pId || category.pId === '0') return [category.name];
    const parent = this.findCategory(category.pId);
    return parent ? [...this.categoryPath(parent), category.name] : [category.name];
  }

  private createCategoryStore() {
    // 父类与标签实体子树直接使用线上真实响应，字段和顺序均不做二次加工。
    const store = new Map<string, CategoryBean[]>();
    store.set('0', this.loadCategoryFixture('parent-categories.json'));
    (this.suppliedChildCategories.get('013') ?? []).forEach((category) => {
      const siblings = store.get(category.pId) ?? [];
      siblings.push(category);
      store.set(category.pId, siblings);
    });

    // 其余维度暂未提供分类接口实包，按 edit 字典分组模拟，但不得混入真实 013 子树。
    const dictionaryRootIds: Record<string, string> = {
      打标属性: '001',
      业务域: '003',
      通用分类: '009',
      作用域: '011',
      风险级别: '015',
    };
    Object.entries(this.editDictionaryPayload).forEach(([groupName, items]) => {
      if (!dictionaryRootIds[groupName]) return;
      items.forEach((item, index) => {
        const id = String(item.value ?? item.id ?? '').trim();
        const parentId = String(item.pId ?? item.pid ?? '').trim();
        const name = String(item.name ?? '').trim();
        if (!id || !parentId || !name) return;
        const siblings = store.get(parentId) ?? [];
        if (siblings.some((category) => category.id === id)) return;
        siblings.push(this.categoryBean(id, name, parentId, 2, 0, index));
        store.set(parentId, siblings);
      });
    });

    if (!store.has('012')) {
      store.set('012', [
        this.categoryBean('012001', '公安内部数据', '012', 2, 3, 0),
        this.categoryBean('012002', '公安外部数据', '012', 2, 0, 1),
        this.categoryBean('012003', '其他数据', '012', 2, 0, 2),
      ]);
      store.set('012001', [
        this.categoryBean('012001001', '治安管理', '012001', 3, 0, 0),
        this.categoryBean('012001002', '反恐怖局', '012001', 3, 0, 1),
        this.categoryBean('012001003', '禁毒', '012001', 3, 0, 2),
      ]);
    }

    return store;
  }

  private toLabelInfo(body: LabelMutationInput): LabelInfo {
    const labelType = toNumber(body.labeltype, 0);
    const shareattr = toNumber(body.shareAttr, 15);
    // 新建标签未显式传状态时仍从“新建”开始，不能直接进入待审核。
    const state = toNumber(body.state, 0);
    const categoryIds = String(body.categorys ?? '003001');
    return {
      categoryDetails: this.categoryDetailsFromIds(categoryIds),
      categoryIds,
      creatDepart: String(body.createRole ?? '620000103'),
      creator: 'bdpauth',
      desc: String(body.desc ?? ''),
      labelAlias: String(body.labelalias ?? ''),
      labelCode: String(body.labelcode ?? this.generateLabelCode()),
      labelEnName: String(body.labelEnName ?? ''),
      labelName: String(body.labelname ?? '未命名标签'),
      labelType,
      labelTypeName: typeNameMap.get(labelType) ?? '布尔标签',
      resultCount: 0,
      shareTypeName: shareNameMap.get(shareattr) ?? '公开',
      shareattr,
      state,
      stateName: statusNameMap.get(state) ?? '待审核',
      version: String(body.version ?? '1.0'),
      createRole: String(body.createRole ?? '620000103'),
      personInput: String(body.personInput ?? ''),
      personDeal: String(body.personDeal ?? ''),
      personOutput: String(body.personOutput ?? ''),
      period: String(body.period ?? ''),
      resource: String(body.resource ?? ''),
    };
  }

  private loginPayload(loginName: string, realName: string) {
    return {
      deptCode: '620000000',
      deptName: '服务开放平台',
      isAdmin: 1,
      loginName,
      menuList: ['label:query', 'label:add', 'label:audit', 'label:authority', 'label:result'],
      mtoken: `mock-token-${loginName}`,
      realName,
      skin: 'default',
    };
  }

  private loadDictionaryPayload(): DictionaryPayload {
    // fixture 随 Nest 构建进入 dist，线上运行不依赖仓库外文件。
    const parsed = this.readDictionaryFixture<SearchDictionaryFile>('search-dic.json');
    if (!parsed.data) throw new Error('Invalid tag management dictionary fixture: search-dic.json');
    return parsed.data;
  }

  private loadEditDictionaryPayload(): Record<string, DictionarySourceItem[]> {
    const parsed = this.readDictionaryFixture<EditDictionaryFile>('edit-dic.json');
    if (!parsed.data) throw new Error('Invalid tag management dictionary fixture: edit-dic.json');
    // 真实 level=edit 接口直接按中文名称分组，不包含 search 字典的二层包装。
    return parsed.data;
  }

  private loadCategoryFixture(fileName: string): CategoryBean[] {
    const parsed = this.readDictionaryFixture<CategoryFixtureFile>(fileName);
    if (!parsed.data) throw new Error(`Invalid tag management category fixture: ${fileName}`);
    return parsed.data;
  }

  private readDictionaryFixture<T>(fileName: string): T {
    const filePath = resolve(__dirname, 'fixtures', fileName);
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  }

  private matchesRoleFilter(label: LabelInfo, roleCodes: string[], roleFilterType: number) {
    if (roleCodes.length === 0) return true;
    if (roleFilterType === 0) return true;
    if (roleFilterType === 1 || roleFilterType === -1) {
      const authorized = roleCodes.some((roleCode) =>
        this.rolePermissions.get(roleCode)?.has(label.labelCode),
      );
      return roleFilterType === 1 ? authorized : !authorized;
    }
    return true;
  }
}

/** 按文档分页字段返回列表，空结果仍保留合法分页元数据。 */
function paginate<T>(rows: T[], body: PaginationInput) {
  const nowPage = Math.max(1, toNumber(body.nowPage, 1));
  const pageSize = Math.max(1, toNumber(body.pageSize, 10));
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = (nowPage - 1) * pageSize;
  const list = rows.slice(start, start + pageSize);
  return {
    lastNum: total % pageSize || Math.min(pageSize, total),
    list,
    nowPage,
    pageCount,
    pageSize,
    pagejs: '',
    total,
  };
}

function toNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function splitCodes(value: unknown) {
  return String(value ?? '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCategoryId(value: string) {
  return value.replace(/^dimension-/, '').replace(/^category-/, '');
}

function toDInfo(category: CategoryBean | undefined) {
  return {
    code: category?.id ?? '',
    name: category?.name ?? '',
  };
}

function createLabels(): LabelInfo[] {
  return [
    label('AEIL00007', 'aaaaaaaa', 0, 15, 0, 0, ''),
    label('ZB000004', '同地址多企业', 0, 15, 1, 0, '识别同一地址下存在多家企业的风险标签。'),
    label(
      'ZA005993',
      '多媒体-场景分类-账单截图图片',
      1,
      15,
      1,
      1420,
      '标识是否含有账单截图的图片。',
    ),
    label('ZA005992', '多媒体-场景分类-自残图片', 1, 15, 1, 1200, '标识是否含有自残行为的图片。'),
    label('Y01ABD00', '新疆喀什地区手机号', 0, 15, 1, 890, '对新疆喀什地区的手机号打标。'),
    label(
      'ZB000005',
      '重点人员异常聚集',
      0,
      15,
      1,
      680,
      '识别重点人员短时间内在同一区域异常聚集的风险标签。',
    ),
    label('AC000395', '前往北京的票价', 1, 15, 1, 356, '统计一个人从本地出发前往北京的次数。'),
    label('ZA005991', '多媒体-场景分类-红色横幅', 1, 15, 4, 760, '标志带有红色横幅的图片。'),
    label('ZA005988', '多媒体-场景分类-多部手机图片', 1, 15, 4, 2340, '标识是否含有多部手机图片。'),
    label(
      'ZA005987',
      '多媒体-场景分类-支付宝拍照图片',
      1,
      15,
      4,
      980,
      '标识是否含有支付宝拍照的图片。',
    ),
    label('ZA005930', '涉毒人员|禁毒', 1, 15, 4, 1420, '人口状态。'),
  ];
}

function label(
  labelCode: string,
  labelName: string,
  labelType: number,
  shareattr: number,
  state: number,
  resultCount: number,
  desc: string,
): LabelInfo {
  return {
    categoryDetails: {
      '001001': {
        cateCode: '001001',
        cateFullName: '打标属性/人员',
      },
      '015001': {
        cateCode: '015001',
        cateFullName: '风险级别/高',
      },
      '012003': {
        cateCode: '012003',
        cateFullName: '管理域/其他数据',
      },
      '003001': {
        cateCode: '003001',
        cateFullName: '业务域/诈骗',
      },
      '009001': {
        cateCode: '009001',
        cateFullName: '通用分类/基础标签',
      },
      '011001': {
        cateCode: '011001',
        cateFullName: '作用域/行为标签',
      },
      '013008': {
        cateCode: '013008',
        cateFullName: '标签实体/对象',
      },
    },
    categoryIds: '001001,003001,009001,011001,012003,013008,015001',
    creatDepart: '620000103',
    creator: 'bdpauth',
    desc,
    labelAlias: labelName.includes('-') ? labelName.split('-').slice(-1)[0] : '',
    labelCode,
    labelEnName: '',
    labelName,
    labelType,
    labelTypeName: typeNameMap.get(labelType) ?? '布尔标签',
    resultCount,
    shareTypeName: shareNameMap.get(shareattr) ?? '公开',
    shareattr,
    state,
    stateName: statusNameMap.get(state) ?? '待审核',
    version: labelCode === 'ZB000004' || labelCode === 'AC000395' ? '1.1' : '1.0',
    createRole: '620000103',
    personInput: '原始数据、知识库数据',
    personDeal: '过滤、匹配、聚合、分组',
    personOutput: '标签结果',
    period: '每日',
    resource: '标签资源表(服务开放平台)',
  };
}

function toAuditResponse(audit: InternalAuditInfo): AuditInfo {
  return {
    auditId: audit.auditId,
    bcontent: audit.bcontent,
    desc: audit.desc,
    labelCode: audit.labelCode,
    labelName: audit.labelName,
    labelStatus: audit.labelStatus,
    labelType: audit.labelType,
    labelTypeValue: audit.labelTypeValue,
    rcontent: audit.rcontent,
    result: audit.result,
    shareAttr: audit.shareAttr,
    shareAttrValue: audit.shareAttrValue,
    state: audit.state,
    stateValue: audit.stateValue,
    status: audit.status,
    statusValue: audit.statusValue,
  };
}

function toLabelMetadataResponse(label: LabelInfo) {
  return {
    categoryDetails: label.categoryDetails,
    categoryIds: label.categoryIds,
    creatDepart: label.creatDepart,
    creator: label.creator,
    desc: label.desc,
    labelAlias: label.labelAlias,
    labelCode: label.labelCode,
    labelEnName: label.labelEnName,
    labelName: label.labelName,
    labelType: label.labelType,
    labelTypeName: label.labelTypeName,
    resultCount: label.resultCount,
    shareTypeName: label.shareTypeName,
    shareattr: label.shareattr,
    state: label.state,
    stateName: label.stateName,
    version: label.version,
  };
}

function createAudits(labels: LabelInfo[]): InternalAuditInfo[] {
  const byCode = new Map(labels.map((item) => [item.labelCode, item]));
  const audit = (
    auditId: string,
    labelCode: string,
    labelStatus: string,
    status: number,
    statusValue: string,
    result: string,
    listTypes: AuditListType[],
  ): InternalAuditInfo => {
    const item = byCode.get(labelCode);
    return {
      auditId,
      bcontent: '',
      desc: item?.desc ?? '',
      labelCode,
      labelName: item?.labelName ?? labelCode,
      labelStatus,
      labelType: item?.labelType ?? 0,
      labelTypeValue: item?.labelTypeName ?? '布尔标签',
      rcontent: '',
      result,
      shareAttr: item?.shareattr ?? 15,
      shareAttrValue: item?.shareTypeName ?? '公开',
      state: item?.state ?? 1,
      stateValue: item?.stateName ?? '待审核',
      status,
      statusValue,
      listTypes,
    };
  };

  return [
    audit('audit-001', 'ZA005988', '申请使用权限', 24, '未审核', '', ['apply', 'audit']),
    audit('audit-002', 'ZA005987', '申请使用权限', 24, '未审核', '', ['apply', 'audit']),
    audit('audit-003', 'ZB000004', '标签新增申请', 24, '未审核', '', ['audit']),
    audit('audit-004', 'ZA005991', '申请使用权限', 22, '驳回', '申请理由不完整', ['apply']),
    audit('audit-005', 'ZA005991', '申请暂停', 21, '通过', '审核通过', ['apply']),
    audit('audit-006', 'ZA005993', '标签新增申请', 24, '未审核', '', ['audit']),
    audit('audit-007', 'ZA005992', '标签新增申请', 24, '未审核', '', ['audit']),
    audit('audit-008', 'Y01ABD00', '标签新增申请', 24, '未审核', '', ['apply', 'audit']),
  ];
}

function createRoles(): RoleInfo[] {
  return [
    role('620000103', '服务开放平台管理员', '服务开放平台管理员'),
    role('620000180', 'FH任务发起员', 'FH任务发起员'),
    role('620000181', 'FH任务中心一级审批(版本一)', 'FH任务中心一级审批'),
    role('620000160', '业务员', '业务审批员'),
    role('420100101', '服务开放平台一般用户', '服务开放平台一般用户'),
    role('620000183', 'FH法制审核员审核', '法制审核'),
    role('UNITADMIN', '机构管理员', '机构管理员'),
  ];
}

function createDataResources(): DataResourceInfo[] {
  return [
    {
      datasourceIdentifier: 'DR-TAG-001',
      name: '标签资源表',
      tableName: 'tag_resource_result',
    },
    {
      datasourceIdentifier: 'DR-PERSON-001',
      name: '人员基础信息表',
      tableName: 'person_basic_info',
    },
    {
      datasourceIdentifier: 'DR-MEDIA-001',
      name: '多媒体图片识别表',
      tableName: 'media_image_scene',
    },
  ];
}

function role(realmCode: string, realmName: string, realmInfo: string): RoleInfo {
  return {
    realmCode,
    realmInfo,
    realmName,
    sortNum: 1,
  };
}

function createResultRecords(): ResultRecord[] {
  return [
    {
      atttype: '人员',
      attvl: '420100199001010011',
      ftime: '2026-06-24 09:00:00',
      lab: '多媒体-场景分类-多部手机图片',
      ltime: '2026-06-30 10:30:00',
      source: '服务业务系统',
    },
    {
      atttype: '人员',
      attvl: '420100199001010022',
      ftime: '2026-06-23 09:00:00',
      lab: '涉毒人员|禁毒',
      ltime: '2026-06-30 10:00:00',
      source: '禁毒业务系统',
    },
  ];
}
