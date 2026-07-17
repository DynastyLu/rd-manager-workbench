import { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { closeE2eApp, createE2eApp } from './helpers/e2e-app';

describe('tag management latest document e2e', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const categoryFixture = (fileName: string) =>
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../src/modules/tag-management-mock/fixtures', fileName),
        'utf8',
      ),
    ) as { data: Array<Record<string, unknown>> };
  const documentedLabelMetadataKeys = [
    'categoryDetails',
    'categoryIds',
    'creatDepart',
    'creator',
    'desc',
    'labelAlias',
    'labelCode',
    'labelEnName',
    'labelName',
    'labelType',
    'labelTypeName',
    'resultCount',
    'shareTypeName',
    'shareattr',
    'state',
    'stateName',
    'version',
  ].sort();
  const documentedPageKeys = [
    'lastNum',
    'list',
    'nowPage',
    'pageCount',
    'pageSize',
    'pagejs',
    'total',
  ].sort();
  const documentedCategoryKeys = [
    'classAttach',
    'classType',
    'createRole',
    'createTime',
    'creator',
    'desc',
    'filter',
    'id',
    'labelCount',
    'level',
    'multiSelect',
    'name',
    'pId',
    'registerItem',
    'registerRequired',
    'sort',
    'state',
    'updateTime',
    'updator',
  ].sort();
  const documentedAuditKeys = [
    'auditId',
    'bcontent',
    'desc',
    'labelCode',
    'labelName',
    'labelStatus',
    'labelType',
    'labelTypeValue',
    'rcontent',
    'result',
    'shareAttr',
    'shareAttrValue',
    'state',
    'stateValue',
    'status',
    'statusValue',
  ].sort();
  const documentedLabelBeanKeys = [
    'auditor',
    'creatDepart',
    'creatDepartName',
    'createtime',
    'creator',
    'desc',
    'endtime',
    'isDepend',
    'isDependStr',
    'istemp',
    'labelEnName',
    'labelTag',
    'labelValue',
    'labelalias',
    'labelcode',
    'labelname',
    'labelnature',
    'labelnatureValue',
    'labeltype',
    'labeltypeStr',
    'language',
    'object',
    'resourceDepart',
    'resourceDepartTrans',
    'resourceSys',
    'resourceSysTrans',
    'shareAttr',
    'shareAttrValue',
    'starttime',
    'state',
    'stateStr',
    'subject',
    'updateDepart',
    'updatetime',
    'updator',
    'version',
  ].sort();
  const documentedLabelRuleKeys = [
    'createtime',
    'creator',
    'creatorDepart',
    'edges',
    'edgesValue',
    'labelcode',
    'period',
    'personDeal',
    'personInput',
    'personOutput',
    'resource',
    'ruleId',
    'state',
    'updatetime',
    'updator',
    'updatorDepart',
  ].sort();

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
  });

  afterAll(async () => {
    await closeE2eApp(app, prisma);
  });

  it('returns the supplied parent and child category responses without generated records', async () => {
    const server = app.getHttpServer();
    const parentFixture = categoryFixture('parent-categories.json');
    const childFixture = categoryFixture('child-categories-013.json');

    const parentResponse = await request(server).get('/labelCategory/parentCategoryInfo');
    const childResponse = await request(server)
      .get('/labelCategory/childCategoryInfo')
      .query({ parentId: '013' });

    expect(parentResponse.status).toBe(200);
    expect(parentResponse.body.data).toEqual(parentFixture.data);
    expect(childResponse.status).toBe(200);
    expect(childResponse.body.data).toEqual(childFixture.data);
  });

  it('serves the latest tag-management state flow', async () => {
    const server = app.getHttpServer();

    const parentCategories = await request(server).get('/labelCategory/parentCategoryInfo');
    expect(parentCategories.status).toBe(200);
    expect(parentCategories.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
      ]),
    );
    expect(Object.keys(parentCategories.body.data[0]).sort()).toEqual(documentedCategoryKeys);
    const selectedParent = parentCategories.body.data[0] as { id: string };

    const childCategories = await request(server)
      .get('/labelCategory/childCategoryInfo')
      .query({ parentId: selectedParent.id });
    expect(childCategories.status).toBe(200);
    expect(childCategories.body.data).toEqual(expect.any(Array));
    const returnedCategories = childCategories.body.data as Array<{ id: string; pId: string }>;
    const returnedIds = new Set(returnedCategories.map((category) => category.id));
    expect(returnedCategories.some((category) => category.pId === selectedParent.id)).toBe(true);
    expect(
      returnedCategories.some(
        (category) => category.pId !== selectedParent.id && returnedIds.has(category.pId),
      ),
    ).toBe(true);

    const categoryLabelList = await request(server).post('/labelCategory/labelinfo').send({
      categoryRecursion: 1,
      categorys: selectedParent.id,
      nowPage: 1,
      pageSize: 20,
      viewCode: 'UNITAG',
    });
    expect(categoryLabelList.status).toBe(200);
    expect(categoryLabelList.body.data.list).toEqual(expect.any(Array));

    const addDraftLabel = await request(server).post('/label/addLabel').send({
      desc: 'new document flow label',
      labelcode: 'FLOW0001',
      labelname: '新文档流程标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    expect(addDraftLabel.status).toBe(200);
    expect(addDraftLabel.body).toMatchObject({ code: 200, data: true });

    const submitDraft = await request(server)
      .get('/label/applyStateSs')
      .query({ labelCode: 'FLOW0001' });
    expect(submitDraft.status).toBe(200);
    expect(submitDraft.body).toMatchObject({ code: 200, data: true });

    const reviewList = await request(server).post('/audit/reviewInfos').send({
      nowPage: 1,
      pageSize: 10,
      searchWord: 'FLOW0001',
    });
    expect(reviewList.status).toBe(200);
    const reviewAudit = reviewList.body.data.list[0] as { auditId: string; status: number };
    expect(reviewAudit).toMatchObject({ auditId: expect.any(String), status: 24 });
    expect(Object.keys(reviewAudit).sort()).toEqual(documentedAuditKeys);
    expect(Object.keys(reviewList.body.data).sort()).toEqual(documentedPageKeys);

    const approve = await request(server).post('/audit/auditReview').send({
      auditIds: reviewAudit.auditId,
      result: '',
      status: 21,
    });
    expect(approve.status).toBe(200);

    const approvedList = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 10,
      searchKey: 'FLOW0001',
    });
    expect(approvedList.body.data.list[0]).toMatchObject({
      labelCode: 'FLOW0001',
      state: 2,
      stateName: '审核通过',
    });

    const online = await request(server).get('/label/onlineLabel').query({ labelCode: 'FLOW0001' });
    expect(online.status).toBe(200);

    const onlineList = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 10,
      searchKey: 'FLOW0001',
    });
    expect(onlineList.body.data.list[0]).toMatchObject({
      labelCode: 'FLOW0001',
      state: 4,
      stateName: '上线',
    });

    const detail = await request(server).get('/label/detail').query({ labelCode: 'FLOW0001' });
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      categoryDetailRet: expect.any(Object),
      labelBean: expect.objectContaining({ labelcode: 'FLOW0001' }),
      labelRule: expect.any(Object),
    });
  });

  it('rejects invalid label state transitions without mutating the label', async () => {
    const server = app.getHttpServer();
    await request(server).post('/label/addLabel').send({
      labelcode: 'STATEGUARD1',
      labelname: '状态保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });

    const onlineDraft = await request(server)
      .get('/label/onlineLabel')
      .query({ labelCode: 'STATEGUARD1' });
    expect(onlineDraft.status).toBe(400);
    expect(onlineDraft.body).toMatchObject({ code: -200, data: false });

    const draftList = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 10,
      searchKey: 'STATEGUARD1',
    });
    expect(draftList.body.data.list[0]).toMatchObject({ labelCode: 'STATEGUARD1', state: 0 });

    await request(server).get('/label/applyStateSs').query({ labelCode: 'STATEGUARD1' });
    const duplicateSubmit = await request(server)
      .get('/label/applyStateSs')
      .query({ labelCode: 'STATEGUARD1' });
    expect(duplicateSubmit.status).toBe(400);
    expect(duplicateSubmit.body).toMatchObject({ code: -200, data: false });
  });

  it('returns labels for the default category used by category and permission pages', async () => {
    const server = app.getHttpServer();
    const parents = await request(server).get('/labelCategory/labelCategoryInfo');
    const firstParent = parents.body.data[0] as { id: string };
    const children = await request(server)
      .get('/labelCategory/categoryChildsInfo')
      .query({ parentId: firstParent.id });
    const firstChild = children.body.data[0] as { id: string };
    const labels = await request(server).post('/labelCategory/labelinfo').send({
      categoryRecursion: 1,
      categorys: firstChild.id,
      nowPage: 1,
      pageSize: 10,
      viewCode: 'UNITAG',
    });

    expect(labels.body.data.total).toBeGreaterThan(0);
  });

  it('returns dictionary-backed category codes in label detail without fabricated fallbacks', async () => {
    const server = app.getHttpServer();
    const parents = await request(server).get('/labelCategory/parentCategoryInfo');
    expect(parents.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '009', name: '通用分类' })]),
    );
    expect(parents.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '010', name: '通用分类' })]),
    );

    const detail = await request(server).get('/label/detail').query({ labelCode: 'ZB000004' });
    expect(detail.status).toBe(200);
    expect(detail.body.data.categoryDetailRet).toEqual({
      dbsx: { code: '001001', name: '人员' },
      fxjb: { code: '015001', name: '高' },
      gly: { code: '012003', name: '其他数据' },
      tyfl: { code: '009001', name: '基础标签' },
      ywy: { code: '003001', name: '诈骗' },
      zyy: { code: '011001', name: '行为标签' },
    });
    expect(Object.keys(detail.body.data.labelBean).sort()).toEqual(documentedLabelBeanKeys);
    expect(Object.keys(detail.body.data.labelRule).sort()).toEqual(documentedLabelRuleKeys);
  });

  it('filters result search rows by the requested role authorization', async () => {
    const server = app.getHttpServer();
    const denied = await request(server).post('/label/result/search').send({
      nowPage: 1,
      pageSize: 10,
      roleCode: 'ROLE_WITHOUT_PERMISSIONS',
    });

    expect(denied.body).toMatchObject({
      code: 200,
      data: { list: [], total: 0 },
    });
  });

  it('serves only the latest documented page endpoints', async () => {
    const server = app.getHttpServer();

    const dictionary = await request(server).post('/sys/dic/info').send({ level: 'search' });
    expect(dictionary.status).toBe(200);
    expect(dictionary.body).toMatchObject({
      code: 200,
      data: {
        raidoCheckDicInfo: {
          共享属性: expect.any(Array),
          标签状态: expect.any(Array),
          标签类型: expect.any(Array),
        },
        treeDic: expect.any(Object),
      },
      msg: expect.any(String),
    });

    const editDictionary = await request(server).post('/sys/dic/info').send({ level: 'edit' });
    expect(editDictionary.status).toBe(200);
    expect(editDictionary.body).toMatchObject({
      code: 200,
      data: {
        来源单位: expect.arrayContaining([
          expect.objectContaining({ name: '司法', value: '-178' }),
        ]),
        通用分类: expect.arrayContaining([
          expect.objectContaining({ id: '009001', name: '基础标签' }),
          expect.objectContaining({ id: '009001001', name: '人', pId: '009001' }),
          expect.objectContaining({ id: '009001001001', name: '基本属性', pId: '009001001' }),
        ]),
      },
    });

    const searchDictionary = await request(server).get('/label/dic/info/search');
    expect(searchDictionary.status).toBe(200);
    const labelEditDictionary = await request(server).get('/label/dic/info/edit');
    expect(labelEditDictionary.status).toBe(200);

    const categoryTop = await request(server).get('/labelCategory/labelCategoryInfo');
    expect(categoryTop.status).toBe(200);
    const selectedCategory = categoryTop.body.data[0] as { id: string; name: string };

    const categoryChildren = await request(server)
      .get('/labelCategory/categoryChildsInfo')
      .query({ parentId: selectedCategory.id });
    expect(categoryChildren.status).toBe(200);

    const updateCategory = await request(server)
      .post('/labelCategory/updateCategory')
      .send({
        categoryId: selectedCategory.id,
        desc: `${selectedCategory.name}分类`,
        filter: '1',
        name: selectedCategory.name,
        registerItem: '1',
        registerRequired: '0',
      });
    expect(updateCategory.status).toBe(200);
    expect(updateCategory.body).toMatchObject({ code: 200, data: true });

    const connect = await request(server).post('/labelCategory/connect').send({
      cateCode: selectedCategory.id,
      labelCodes: 'ZA005988',
    });
    expect(connect.status).toBe(200);
    const disconnect = await request(server).post('/labelCategory/disConnect').send({
      cateCode: selectedCategory.id,
      labelCodes: 'ZA005988',
    });
    expect(disconnect.status).toBe(200);

    const labelList = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 5,
      searchKey: '多媒体',
      viewCode: 'UNITAG',
    });
    expect(labelList.status).toBe(200);
    expect(labelList.body).toMatchObject({
      code: 200,
      data: {
        list: expect.arrayContaining([
          expect.objectContaining({
            labelCode: expect.any(String),
            labelName: expect.any(String),
            labelType: expect.any(Number),
            shareattr: expect.any(Number),
            state: expect.any(Number),
          }),
        ]),
        nowPage: 1,
        pageCount: expect.any(Number),
        pageSize: 5,
        total: expect.any(Number),
      },
    });
    expect(Object.keys(labelList.body.data.list[0]).sort()).toEqual(documentedLabelMetadataKeys);
    const categoryDetails = labelList.body.data.list[0].categoryDetails;
    expect(categoryDetails).not.toHaveProperty('cateCode');
    expect(categoryDetails).not.toHaveProperty('cateFullName');
    expect(Object.values(categoryDetails)[0]).toMatchObject({
      cateCode: expect.any(String),
      cateFullName: expect.any(String),
    });
    expect(labelList.body.data.list[0]).not.toHaveProperty('createRole');
    expect(labelList.body.data.list[0]).not.toHaveProperty('personInput');
    expect(labelList.body.data.list[0]).not.toHaveProperty('personDeal');
    expect(labelList.body.data.list[0]).not.toHaveProperty('personOutput');
    expect(labelList.body.data.list[0]).not.toHaveProperty('period');
    expect(labelList.body.data.list[0]).not.toHaveProperty('resource');

    const addLabel = await request(server).post('/label/addLabel').send({
      desc: 'latest interface mock label',
      labelcode: 'DOC0001',
      labelname: '最新接口测试标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    expect(addLabel.status).toBe(200);
    expect(addLabel.body).toMatchObject({ code: 200, data: true });

    const editLabel = await request(server).post('/label/editLabel').send({
      desc: 'edited latest interface mock label',
      labelcode: 'DOC0001',
      labelname: '最新接口测试标签-修改',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    expect(editLabel.status).toBe(200);
    expect(editLabel.body).toMatchObject({ code: 200, data: true });

    await request(server).get('/label/applyStateSs').query({ labelCode: 'DOC0001' });
    const docReviewList = await request(server).post('/audit/reviewInfos').send({
      nowPage: 1,
      pageSize: 10,
      searchWord: 'DOC0001',
    });
    await request(server).post('/audit/auditReview').send({
      auditIds: docReviewList.body.data.list[0].auditId,
      result: '',
      status: 21,
    });

    const online = await request(server).get('/label/onlineLabel').query({ labelCode: 'DOC0001' });
    expect(online.status).toBe(200);
    const suspend = await request(server)
      .get('/label/suspendLabel')
      .query({ labelCode: 'DOC0001' });
    expect(suspend.status).toBe(200);
    const offline = await request(server)
      .get('/label/offlineLabel')
      .query({ labelCode: 'DOC0001' });
    expect(offline.status).toBe(200);

    const applyPermission = await request(server).post('/label/applyLabel').send({
      labelCodes: 'DOC0001',
      roleCodes: '620000103',
      vaild: 1,
      validUntil: 0,
    });
    expect(applyPermission.status).toBe(200);

    const myApplications = await request(server).post('/audit/auditInfos').send({
      nowPage: 1,
      pageSize: 10,
      searchWord: 'DOC0001',
    });
    expect(myApplications.status).toBe(200);
    const application = myApplications.body.data.list[0] as { auditId: string; labelCode: string };
    expect(application).toMatchObject({ auditId: expect.any(String), labelCode: 'DOC0001' });

    const withdraw = await request(server).post('/audit/myApplyReview').send({
      auditIds: application.auditId,
      result: '撤回申请',
    });
    expect(withdraw.status).toBe(200);
    expect(withdraw.body).toMatchObject({ code: 200, data: true });

    const authorityRoles = await request(server).get('/authority/list');
    expect(authorityRoles.status).toBe(200);
    expect(authorityRoles.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ realmCode: expect.any(String), realmName: expect.any(String) }),
      ]),
    );
    expect(Object.keys(authorityRoles.body.data).sort()).toEqual(documentedPageKeys);
    expect(Object.keys(authorityRoles.body.data.list[0]).sort()).toEqual(
      ['realmCode', 'realmInfo', 'realmName', 'sortNum'].sort(),
    );

    const authorityParents = await request(server).get('/authority/parentCategoryInfo');
    expect(authorityParents.status).toBe(200);
    const authorityChildren = await request(server)
      .get('/authority/childCategoryInfo')
      .query({ parentId: selectedCategory.id });
    expect(authorityChildren.status).toBe(200);

    const authorityLabels = await request(server).post('/authority/labelinfo').send({
      nowPage: 1,
      pageSize: 20,
      roleCodes: '620000103',
      roleFilterType: 1,
      viewCode: 'UNITAG',
    });
    expect(authorityLabels.status).toBe(200);
    expect(authorityLabels.body.data.list).toEqual(expect.any(Array));
    expect(Object.keys(authorityLabels.body.data.list[0]).sort()).toEqual(
      documentedLabelMetadataKeys,
    );

    const addAuthority = await request(server).post('/authority/add/byLabelCode').send({
      labelCodes: 'ZA005988',
      roleCodes: '620000103',
      validUntil: 0,
      viewCode: 'UNITAG',
    });
    expect(addAuthority.status).toBe(200);
    expect(addAuthority.body).toMatchObject({ code: 200, data: true });

    const deleteAuthority = await request(server).post('/authority/delete/byLabelCode').send({
      labelCodes: 'ZA005988',
      roleCodes: '620000103',
      viewCode: 'UNITAG',
    });
    expect(deleteAuthority.status).toBe(200);
    expect(deleteAuthority.body).toMatchObject({ code: 200, data: true });

    const accountLogin = await request(server).post('/open/login/account').send({
      loginName: 'admin',
      password: 'changeme123',
    });
    expect(accountLogin.status).toBe(200);
    expect(accountLogin.body).toMatchObject({
      code: 200,
      data: {
        loginName: 'admin',
        menuList: expect.any(Array),
        mtoken: expect.any(String),
      },
    });
    expect(Object.keys(accountLogin.body.data).sort()).toEqual(
      [
        'deptCode',
        'deptName',
        'isAdmin',
        'loginName',
        'menuList',
        'mtoken',
        'realName',
        'skin',
      ].sort(),
    );

    const resultSearch = await request(server).post('/label/result/search').send({
      attrValue: '多部手机',
      nowPage: 1,
      pageSize: 10,
      roleCode: '420100101',
    });
    expect(resultSearch.status).toBe(200);
    expect(resultSearch.body).toMatchObject({
      code: 200,
      data: {
        list: expect.arrayContaining([
          expect.objectContaining({
            lab: expect.any(String),
            source: expect.any(String),
          }),
        ]),
      },
    });
    expect(Object.keys(resultSearch.body.data).sort()).toEqual(documentedPageKeys);
    expect(Object.keys(resultSearch.body.data.list[0]).sort()).toEqual(
      ['atttype', 'attvl', 'ftime', 'lab', 'ltime', 'source'].sort(),
    );

    const overview = await request(server).get('/label/resultStatic/all');
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({
      code: 200,
      data: {
        labelCount: expect.any(Number),
        resultCount: expect.any(Number),
        serviceBeUsedCount: expect.any(Number),
        serviceModCount: expect.any(Number),
      },
    });
    expect(Object.keys(overview.body.data).sort()).toEqual(
      [
        'labelCount',
        'resultCount',
        'serviceBeUsedCount',
        'serviceBeUsedCountInWeek',
        'serviceModCount',
        'weekIncResult',
        'weekInclabel',
      ].sort(),
    );

    const labelCodeResult = await request(server)
      .post('/label/resultStatic/labelCodeResult')
      .query({ nowPage: 1, pageSize: 10 })
      .send({});
    expect(labelCodeResult.status).toBe(200);
    expect(labelCodeResult.body).toMatchObject({
      code: 200,
      data: {
        list: expect.arrayContaining([
          expect.objectContaining({
            labelCode: expect.any(String),
            labelName: expect.any(String),
            totalCount: expect.any(Number),
          }),
        ]),
      },
    });
    expect(Object.keys(labelCodeResult.body.data).sort()).toEqual(documentedPageKeys);
    expect(Object.keys(labelCodeResult.body.data.list[0]).sort()).toEqual(
      ['labelCode', 'labelName', 'totalCount'].sort(),
    );

    const dataResources = await request(server)
      .post('/dataResource/list')
      .query({ searchKey: '标签' })
      .send({});
    expect(dataResources.status).toBe(200);
    expect(dataResources.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          datasourceIdentifier: expect.any(String),
          name: expect.any(String),
          tableName: expect.any(String),
        }),
      ]),
    );
    expect(Object.keys(dataResources.body.data[0]).sort()).toEqual(
      ['datasourceIdentifier', 'name', 'tableName'].sort(),
    );

    const directParentCategoryLabels = await request(server).post('/label/labelinfo').send({
      categoryRecursion: 0,
      categorys: '003',
      nowPage: 1,
      pageSize: 10,
      viewCode: 'UNITAG',
    });
    expect(directParentCategoryLabels.status).toBe(200);
    expect(directParentCategoryLabels.body.data.total).toBe(0);

    const recursiveParentCategoryLabels = await request(server).post('/label/labelinfo').send({
      categoryRecursion: 1,
      categorys: '003',
      nowPage: 1,
      pageSize: 10,
      viewCode: 'UNITAG',
    });
    expect(recursiveParentCategoryLabels.status).toBe(200);
    expect(recursiveParentCategoryLabels.body.data.total).toBeGreaterThan(0);

    const deleteLabel = await request(server)
      .get('/label/delLabel')
      .query({ labelCode: 'DOC0001' });
    expect(deleteLabel.status).toBe(200);
    expect(deleteLabel.body).toMatchObject({ code: 200, data: true });
  });

  it('accepts only documented search and edit dictionary levels', async () => {
    const server = app.getHttpServer();
    const invalidBodies = [{ level: 'edic' }, { type: 'edit' }, { dicType: 'edit' }, {}];
    const responses: Array<{ status: number }> = [];

    for (const body of invalidBodies) {
      responses.push(await request(server).post('/sys/dic/info').send(body));
    }

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
  });

  it('uses only documented query parameters for resource and label-result lists', async () => {
    const server = app.getHttpServer();
    const resourceBaseline = await request(server).post('/dataResource/list').send({});
    const resourceWithUndocumentedBody = await request(server)
      .post('/dataResource/list')
      .send({ searchKey: 'BODY_ONLY_NO_MATCH' });
    const resultWithUndocumentedBody = await request(server)
      .post('/label/resultStatic/labelCodeResult')
      .send({ nowPage: 2, pageSize: 1 });

    expect(resourceBaseline.status).toBe(200);
    expect(resourceWithUndocumentedBody.status).toBe(200);
    expect(resourceWithUndocumentedBody.body.data).toEqual(resourceBaseline.body.data);
    expect(resultWithUndocumentedBody.status).toBe(200);
    expect(resultWithUndocumentedBody.body.data).toMatchObject({ nowPage: 1, pageSize: 10 });
  });

  it('configures tag dictionary assets and keeps source fixtures readable', () => {
    const projectRoot = resolve(__dirname, '../..');
    const nestConfig = JSON.parse(readFileSync(resolve(projectRoot, 'nest-cli.json'), 'utf8')) as {
      compilerOptions?: {
        assets?: Array<Record<string, unknown>>;
      };
    };
    const dictionaryAsset = nestConfig.compilerOptions?.assets?.find(
      (asset) => asset.include === 'modules/tag-management-mock/fixtures/**/*',
    );
    const sourceFixtures = ['edit-dic.json', 'search-dic.json'].map(
      (fileName) =>
        JSON.parse(
          readFileSync(
            resolve(projectRoot, 'src/modules/tag-management-mock/fixtures', fileName),
            'utf8',
          ),
        ) as { data?: unknown },
    );

    expect(dictionaryAsset).toMatchObject({
      include: 'modules/tag-management-mock/fixtures/**/*',
      outDir: 'dist/src',
      watchAssets: true,
    });
    expect(sourceFixtures.every((fixture) => fixture.data !== undefined)).toBe(true);
  });

  it('generates an omitted labelcode but rejects a blank provided labelcode without inserting it', async () => {
    const server = app.getHttpServer();
    const generatedLabelName = '自动生成编码保护标签';
    const blankLabelName = '空白编码禁止插入标签';
    const generatedLabel = await request(server).post('/label/addLabel').send({
      desc: 'generated label code guard',
      labelname: generatedLabelName,
      labeltype: 0,
      shareAttr: 15,
    });
    const generatedList = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 10,
      searchKey: generatedLabelName,
    });
    const blankListBefore = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 10,
      searchKey: blankLabelName,
    });
    const blankLabel = await request(server).post('/label/addLabel').send({
      desc: 'blank label code guard',
      labelcode: '   ',
      labelname: blankLabelName,
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    const blankListAfter = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 10,
      searchKey: blankLabelName,
    });

    expect(generatedLabel.status).toBe(200);
    expect(generatedList.body.data.list[0]).toMatchObject({
      labelCode: expect.stringMatching(/\S/),
      labelName: generatedLabelName,
      state: 0,
      stateName: '新建',
    });
    expect(blankListBefore.body.data.total).toBe(0);
    expect(blankLabel.status).toBe(400);
    expect(blankListAfter.body.data).toEqual(blankListBefore.body.data);
  });

  it('generates unique label codes for concurrent additions', async () => {
    const server = app.getHttpServer();
    if (!server.listening) await app.listen(0, '127.0.0.1');
    const labelNamePrefix = '并发自动编码保护标签';
    const requestCount = 12;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000123456);
    let responses: Array<{ status: number }> = [];

    try {
      responses = await Promise.all(
        Array.from({ length: requestCount }, (_, index) =>
          request(server)
            .post('/label/addLabel')
            .send({
              labelname: `${labelNamePrefix}${index}`,
              labeltype: 0,
              shareAttr: 15,
              state: 0,
            }),
        ),
      );
    } finally {
      nowSpy.mockRestore();
    }

    const list = await request(server).post('/label/labelinfo').send({
      nowPage: 1,
      pageSize: 100,
      searchKey: labelNamePrefix,
    });
    const labelCodes = (list.body.data.list as Array<{ labelCode: string }>).map(
      (label) => label.labelCode,
    );

    expect(responses.map((response) => response.status)).toEqual(Array(requestCount).fill(200));
    expect(labelCodes).toHaveLength(requestCount);
    expect(new Set(labelCodes).size).toBe(requestCount);
  });

  it('rejects editLabel without a non-blank labelcode and keeps the label unchanged', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDEDIT1';
    const setup = await request(server).post('/label/addLabel').send({
      desc: 'edit identifier validation guard',
      labelcode: labelCode,
      labelname: '编辑标识保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    const readLabel = async () => {
      const response = await request(server).post('/label/labelinfo').send({
        nowPage: 1,
        pageSize: 10,
        searchKey: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const body of [
      { labelname: '不得写入的缺失编码标签名', shareAttr: 15 },
      { labelcode: '   ', labelname: '不得写入的空白编码标签名', shareAttr: 15 },
    ]) {
      const before = await readLabel();
      const mutation = await request(server).post('/label/editLabel').send(body);
      const after = await readLabel();
      outcomes.push({ after, before, status: mutation.status });
    }

    expect(setup.status).toBe(200);
    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('partially edits only submitted label, category, and rule fields', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDPARTIAL1';
    const setup = await request(server).post('/label/addLabel').send({
      categorys: '003001',
      createRole: '620000103',
      desc: '原始标签描述',
      labelEnName: 'original_label',
      labelalias: '原始别名',
      labelcode: labelCode,
      labelname: '部分编辑保护标签',
      labeltype: 1,
      period: '每日',
      personDeal: '原始处理',
      personInput: '原始输入',
      personOutput: '原始输出',
      resource: 'original_table',
      shareAttr: 16,
      state: 4,
      version: '2.3',
    });
    const readDetail = async () => {
      const response = await request(server).get('/label/detail').query({ labelCode });
      expect(response.status).toBe(200);
      return response.body.data;
    };

    const before = await readDetail();
    const editDescription = await request(server).post('/label/editLabel').send({
      labelcode: labelCode,
      desc: '更新后的标签描述',
    });
    const afterDescription = await readDetail();
    const editPeriod = await request(server).post('/label/editLabel').send({
      labelcode: labelCode,
      period: '每月',
    });
    const afterPeriod = await readDetail();

    expect(setup.status).toBe(200);
    expect(editDescription.status).toBe(200);
    expect(afterDescription.labelBean).toEqual({
      ...before.labelBean,
      desc: '更新后的标签描述',
    });
    expect(afterDescription.categoryDetailRet).toEqual(before.categoryDetailRet);
    expect(afterDescription.labelRule).toEqual(before.labelRule);
    expect(editPeriod.status).toBe(200);
    expect(afterPeriod.labelBean).toEqual(afterDescription.labelBean);
    expect(afterPeriod.categoryDetailRet).toEqual(afterDescription.categoryDetailRet);
    expect(afterPeriod.labelRule).toEqual({
      ...afterDescription.labelRule,
      period: '每月',
    });
  });

  it('rejects updateCategory without a non-blank categoryId and keeps categories unchanged', async () => {
    const server = app.getHttpServer();
    const readCategories = async () => {
      const response = await request(server).get('/labelCategory/labelCategoryInfo');
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const body of [
      { name: '不得写入的缺失分类标识名称' },
      { categoryId: '   ', name: '不得写入的空白分类标识名称' },
    ]) {
      const before = await readCategories();
      const mutation = await request(server).post('/labelCategory/updateCategory').send(body);
      const after = await readCategories();
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects non-string updateCategory fields and keeps categories unchanged', async () => {
    const server = app.getHttpServer();
    const readCategories = async () => {
      const response = await request(server).get('/labelCategory/labelCategoryInfo');
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const initialCategories = await readCategories();
    const categoryId = initialCategories[0].id as string;
    const invalidBodies = [
      { categoryId, desc: { value: '对象描述' } },
      { categoryId, filter: ['1'] },
      { categoryId, name: true },
      { categoryId, registerItem: 1 },
      { categoryId, registerRequired: 0 },
    ];
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const body of invalidBodies) {
      const before = await readCategories();
      const mutation = await request(server).post('/labelCategory/updateCategory').send(body);
      const after = await readCategories();
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects undocumented shareattr for addLabel and editLabel without changing labels', async () => {
    const server = app.getHttpServer();
    const addLabelCode = 'GUARDSHAREADD1';
    const editLabelCode = 'GUARDSHAREEDIT1';
    const readLabel = async (labelCode: string) => {
      const response = await request(server).post('/label/labelinfo').send({
        nowPage: 1,
        pageSize: 10,
        searchKey: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data;
    };

    const addBefore = await readLabel(addLabelCode);
    const invalidAdd = await request(server).post('/label/addLabel').send({
      labelcode: addLabelCode,
      labelname: '文档外新增共享字段标签',
      labeltype: 0,
      shareattr: 14,
      state: 0,
    });
    const addAfter = await readLabel(addLabelCode);

    const setupEdit = await request(server).post('/label/addLabel').send({
      labelcode: editLabelCode,
      labelname: '文档外编辑共享字段保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    const editBefore = await readLabel(editLabelCode);
    const invalidEdit = await request(server).post('/label/editLabel').send({
      labelcode: editLabelCode,
      labelname: '不得写入的文档外共享字段标签名',
      shareattr: 14,
    });
    const editAfter = await readLabel(editLabelCode);

    expect(invalidAdd.status).toBe(400);
    expect(addAfter).toEqual(addBefore);
    expect(setupEdit.status).toBe(200);
    expect(invalidEdit.status).toBe(400);
    expect(editAfter).toEqual(editBefore);
  });

  it('rejects boolean, empty, and out-of-range label numeric fields on add and edit', async () => {
    const server = app.getHttpServer();
    const editLabelCode = 'GUARDNUMEDIT1';
    await request(server).post('/label/addLabel').send({
      labelcode: editLabelCode,
      labelname: '数字字段编辑保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    const readLabel = async (labelCode: string) => {
      const response = await request(server).post('/label/labelinfo').send({
        nowPage: 1,
        pageSize: 10,
        searchKey: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const invalidFields: Array<{
      field: 'labeltype' | 'shareAttr' | 'state';
      value: unknown;
    }> = [
      { field: 'labeltype', value: true },
      { field: 'labeltype', value: '' },
      { field: 'labeltype', value: null },
      { field: 'labeltype', value: 4 },
      { field: 'shareAttr', value: true },
      { field: 'shareAttr', value: '' },
      { field: 'shareAttr', value: null },
      { field: 'shareAttr', value: 13 },
      { field: 'state', value: true },
      { field: 'state', value: '' },
      { field: 'state', value: null },
      { field: 'state', value: 7 },
    ];
    const outcomes: Array<{
      addCount: number;
      addStatus: number;
      editAfter: unknown;
      editBefore: unknown;
      editStatus: number;
    }> = [];

    for (const [index, invalidField] of invalidFields.entries()) {
      const addLabelCode = `GUARDNUMADD${index}`;
      const invalidAdd = await request(server)
        .post('/label/addLabel')
        .send({
          labelcode: addLabelCode,
          labelname: `数字字段新增保护标签${index}`,
          labeltype: 0,
          shareAttr: 15,
          state: 0,
          [invalidField.field]: invalidField.value,
        });
      const addAfter = await readLabel(addLabelCode);
      const editBefore = await readLabel(editLabelCode);
      const invalidEdit = await request(server)
        .post('/label/editLabel')
        .send({
          labelcode: editLabelCode,
          [invalidField.field]: invalidField.value,
        });
      const editAfter = await readLabel(editLabelCode);
      outcomes.push({
        addCount: addAfter.total,
        addStatus: invalidAdd.status,
        editAfter,
        editBefore,
        editStatus: invalidEdit.status,
      });
    }

    for (const outcome of outcomes) {
      expect(outcome.addStatus).toBe(400);
      expect(outcome.addCount).toBe(0);
      expect(outcome.editStatus).toBe(400);
      expect(outcome.editAfter).toEqual(outcome.editBefore);
    }
  });

  it('rejects unsafe permission numeric values', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDNUMPERM1';
    const roleCode = 'GUARD_NUMERIC_ROLE';
    await request(server).post('/label/addLabel').send({
      labelcode: labelCode,
      labelname: '权限数字字段保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 4,
    });
    const invalidRequests = [
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: true, validUntil: 0 },
      },
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: '', validUntil: 0 },
      },
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: 2, validUntil: 0 },
      },
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: 1, validUntil: true },
      },
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: 1, validUntil: '' },
      },
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: 1, validUntil: -1 },
      },
      {
        path: '/authority/add/byLabelCode',
        body: { labelCodes: labelCode, roleCodes: roleCode, validUntil: true },
      },
      {
        path: '/authority/add/byLabelCode',
        body: { labelCodes: labelCode, roleCodes: roleCode, validUntil: '' },
      },
      {
        path: '/authority/add/byLabelCode',
        body: { labelCodes: labelCode, roleCodes: roleCode, validUntil: -1 },
      },
    ];
    const responses: Array<{ status: number }> = [];

    for (const invalidRequest of invalidRequests) {
      responses.push(await request(server).post(invalidRequest.path).send(invalidRequest.body));
    }

    expect(responses.map((response) => response.status)).toEqual(
      Array(invalidRequests.length).fill(400),
    );
  });

  it('rejects explicit null permission numbers without changing audits or permissions', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDNULLPERM1';
    const roleCode = 'GUARD_NULL_PERMISSION_ROLE';
    await request(server).post('/label/addLabel').send({
      labelcode: labelCode,
      labelname: '权限空值保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 4,
    });
    const readApplications = async () => {
      const response = await request(server).post('/audit/auditInfos').send({
        nowPage: 1,
        pageSize: 20,
        searchWord: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };
    const readAuthorizedCodes = async () => {
      const response = await request(server).post('/authority/labelinfo').send({
        nowPage: 1,
        pageSize: 20,
        roleCodes: roleCode,
        roleFilterType: 1,
        searchKey: labelCode,
        viewCode: 'UNITAG',
      });
      expect(response.status).toBe(200);
      return (response.body.data.list as Array<{ labelCode: string }>).map(
        (label) => label.labelCode,
      );
    };
    const invalidRequests = [
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: null, validUntil: 0 },
      },
      {
        path: '/label/applyLabel',
        body: { labelCodes: labelCode, roleCodes: roleCode, vaild: 1, validUntil: null },
      },
      {
        path: '/authority/add/byLabelCode',
        body: { labelCodes: labelCode, roleCodes: roleCode, validUntil: null },
      },
    ];
    const outcomes: Array<{
      applicationsAfter: unknown;
      applicationsBefore: unknown;
      authorizedAfter: unknown;
      authorizedBefore: unknown;
      status: number;
    }> = [];

    for (const invalidRequest of invalidRequests) {
      const applicationsBefore = await readApplications();
      const authorizedBefore = await readAuthorizedCodes();
      const mutation = await request(server).post(invalidRequest.path).send(invalidRequest.body);
      const applicationsAfter = await readApplications();
      const authorizedAfter = await readAuthorizedCodes();
      outcomes.push({
        applicationsAfter,
        applicationsBefore,
        authorizedAfter,
        authorizedBefore,
        status: mutation.status,
      });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.applicationsAfter).toEqual(outcome.applicationsBefore);
      expect(outcome.authorizedAfter).toEqual(outcome.authorizedBefore);
    }
  });

  it('rejects unsafe roleFilterType values on every labelinfo endpoint', async () => {
    const server = app.getHttpServer();
    const paths = ['/label/labelinfo', '/labelCategory/labelinfo', '/authority/labelinfo'];
    const validQuery = {
      nowPage: 1,
      pageSize: 10,
      roleCodes: '620000103',
      roleFilterType: -1,
      searchKey: 'ZA005988',
      viewCode: 'UNITAG',
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const path of paths) {
      const before = await request(server).post(path).send(validQuery);
      expect(before.status).toBe(200);
      for (const roleFilterType of [2, true, '', null]) {
        const invalid = await request(server)
          .post(path)
          .send({ ...validQuery, roleFilterType });
        const after = await request(server).post(path).send(validQuery);
        expect(after.status).toBe(200);
        outcomes.push({
          after: after.body.data,
          before: before.body.data,
          status: invalid.status,
        });
      }
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects empty applyLabel code lists without creating audits', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDAPPLY1';
    await request(server).post('/label/addLabel').send({
      desc: 'apply label validation guard',
      labelcode: labelCode,
      labelname: '申请权限参数保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });

    const readApplications = async () => {
      const response = await request(server).post('/audit/auditInfos').send({
        nowPage: 1,
        pageSize: 100,
        searchWord: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };
    const invalidBodies = [
      { roleCodes: '620000103', vaild: 1, validUntil: 0 },
      { labelCodes: labelCode, vaild: 1, validUntil: 0 },
      { labelCodes: ',，', roleCodes: '620000103', vaild: 1, validUntil: 0 },
      { labelCodes: labelCode, roleCodes: ',，', vaild: 1, validUntil: 0 },
    ];
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const body of invalidBodies) {
      const before = await readApplications();
      const mutation = await request(server).post('/label/applyLabel').send(body);
      const after = await readApplications();
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('applies permission changes only after approval and ignores rejection or withdrawal', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDPERMFLOW1';
    const roleCode = 'GUARD_PERMISSION_ROLE';
    await request(server).post('/label/addLabel').send({
      labelcode: labelCode,
      labelname: '权限审核流程保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 4,
    });

    const readAuthorizedCodes = async () => {
      const response = await request(server).post('/authority/labelinfo').send({
        nowPage: 1,
        pageSize: 20,
        roleCodes: roleCode,
        roleFilterType: 1,
        searchKey: labelCode,
        viewCode: 'UNITAG',
      });
      expect(response.status).toBe(200);
      return (response.body.data.list as Array<{ labelCode: string }>).map(
        (label) => label.labelCode,
      );
    };
    const readLatestApplication = async () => {
      const response = await request(server).post('/audit/auditInfos').send({
        nowPage: 1,
        pageSize: 20,
        searchWord: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list[0] as {
        auditId: string;
        bcontent: string;
        labelStatus: string;
        status: number;
      };
    };

    const initialAuthorized = await readAuthorizedCodes();
    const grantRequest = await request(server).post('/label/applyLabel').send({
      labelCodes: labelCode,
      roleCodes: roleCode,
      vaild: 1,
      validUntil: 0,
    });
    const pendingGrant = await readLatestApplication();
    const pendingGrantAuthorized = await readAuthorizedCodes();
    const approveGrant = await request(server).post('/audit/auditReview').send({
      auditIds: pendingGrant.auditId,
      result: '',
      status: 21,
    });
    const approvedAuthorized = await readAuthorizedCodes();

    const cancelRequest = await request(server).post('/label/applyLabel').send({
      labelCodes: labelCode,
      roleCodes: roleCode,
      vaild: 0,
      validUntil: 0,
    });
    const pendingCancel = await readLatestApplication();
    const pendingCancelAuthorized = await readAuthorizedCodes();
    const approveCancel = await request(server).post('/audit/auditReview').send({
      auditIds: pendingCancel.auditId,
      result: '',
      status: 21,
    });
    const canceledAuthorized = await readAuthorizedCodes();

    await request(server).post('/label/applyLabel').send({
      labelCodes: labelCode,
      roleCodes: roleCode,
      vaild: 1,
      validUntil: 0,
    });
    const pendingRejection = await readLatestApplication();
    const rejectGrant = await request(server).post('/audit/auditReview').send({
      auditIds: pendingRejection.auditId,
      result: '权限申请驳回',
      status: 22,
    });
    const rejectedApplication = await readLatestApplication();
    const rejectedAuthorized = await readAuthorizedCodes();

    await request(server).post('/label/applyLabel').send({
      labelCodes: labelCode,
      roleCodes: roleCode,
      vaild: 1,
      validUntil: 0,
    });
    const pendingWithdrawal = await readLatestApplication();
    const withdrawGrant = await request(server).post('/audit/myApplyReview').send({
      auditIds: pendingWithdrawal.auditId,
      result: '撤回权限申请',
      status: 23,
    });
    const withdrawnApplication = await readLatestApplication();
    const withdrawnAuthorized = await readAuthorizedCodes();

    expect(initialAuthorized).toEqual([]);
    expect(grantRequest.status).toBe(200);
    expect(pendingGrant).toMatchObject({
      bcontent: roleCode,
      labelStatus: '申请使用权限',
      status: 24,
    });
    expect(pendingGrantAuthorized).toEqual([]);
    expect(approveGrant.status).toBe(200);
    expect(approvedAuthorized).toEqual([labelCode]);
    expect(cancelRequest.status).toBe(200);
    expect(pendingCancel).toMatchObject({
      bcontent: roleCode,
      labelStatus: '取消使用权限',
      status: 24,
    });
    expect(pendingCancelAuthorized).toEqual([labelCode]);
    expect(approveCancel.status).toBe(200);
    expect(canceledAuthorized).toEqual([]);
    expect(rejectGrant.status).toBe(200);
    expect(rejectedApplication.status).toBe(22);
    expect(rejectedAuthorized).toEqual([]);
    expect(withdrawGrant.status).toBe(200);
    expect(withdrawnApplication.status).toBe(23);
    expect(withdrawnAuthorized).toEqual([]);
  });

  it('rejects explicit null audit statuses without changing audit records', async () => {
    const server = app.getHttpServer();
    const reviewLabelCode = 'GUARDNULLREVIEW1';
    const withdrawalLabelCode = 'GUARDNULLWITHDRAW1';
    await request(server).post('/label/addLabel').send({
      labelcode: reviewLabelCode,
      labelname: '审核状态空值保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    await request(server).get('/label/applyStateSs').query({ labelCode: reviewLabelCode });
    await request(server).post('/label/addLabel').send({
      labelcode: withdrawalLabelCode,
      labelname: '撤回状态空值保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 4,
    });
    await request(server).post('/label/applyLabel').send({
      labelCodes: withdrawalLabelCode,
      roleCodes: 'GUARD_NULL_AUDIT_ROLE',
      vaild: 1,
      validUntil: 0,
    });
    const readReview = async () => {
      const response = await request(server).post('/audit/reviewInfos').send({
        nowPage: 1,
        pageSize: 10,
        searchWord: reviewLabelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };
    const readWithdrawal = async () => {
      const response = await request(server).post('/audit/auditInfos').send({
        nowPage: 1,
        pageSize: 10,
        searchWord: withdrawalLabelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };

    const reviewBefore = await readReview();
    const invalidReview = await request(server).post('/audit/auditReview').send({
      auditIds: reviewBefore[0].auditId,
      status: null,
    });
    const reviewAfter = await readReview();
    const withdrawalBefore = await readWithdrawal();
    const invalidWithdrawal = await request(server).post('/audit/myApplyReview').send({
      auditIds: withdrawalBefore[0].auditId,
      status: null,
    });
    const withdrawalAfter = await readWithdrawal();

    expect(invalidReview.status).toBe(400);
    expect(reviewAfter).toEqual(reviewBefore);
    expect(invalidWithdrawal.status).toBe(400);
    expect(withdrawalAfter).toEqual(withdrawalBefore);
  });

  it('rejects normalized-empty auditIds for review and withdrawal without changing audits', async () => {
    const server = app.getHttpServer();
    const reviewLabelCode = 'GUARDCOMMA1';
    const withdrawalLabelCode = 'GUARDWITHDRAW1';

    await request(server).post('/label/addLabel').send({
      labelcode: reviewLabelCode,
      labelname: '审核列表规范化保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    await request(server).get('/label/applyStateSs').query({ labelCode: reviewLabelCode });
    await request(server).post('/label/addLabel').send({
      labelcode: withdrawalLabelCode,
      labelname: '撤回列表规范化保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    await request(server).post('/label/applyLabel').send({
      labelCodes: withdrawalLabelCode,
      roleCodes: '620000103',
      vaild: 1,
      validUntil: 0,
    });

    const readReview = async () => {
      const response = await request(server).post('/audit/reviewInfos').send({
        nowPage: 1,
        pageSize: 10,
        searchWord: reviewLabelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };
    const readWithdrawal = async () => {
      const response = await request(server).post('/audit/auditInfos').send({
        nowPage: 1,
        pageSize: 10,
        searchWord: withdrawalLabelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };

    const reviewBefore = await readReview();
    const invalidReview = await request(server).post('/audit/auditReview').send({
      auditIds: ',，',
      result: '',
      status: 21,
    });
    const reviewAfter = await readReview();
    const withdrawalOutcomes: Array<{
      after: unknown;
      before: unknown;
      status: number;
    }> = [];
    for (const body of [{ status: 23 }, { auditIds: ',，', status: 23 }]) {
      const before = await readWithdrawal();
      const mutation = await request(server).post('/audit/myApplyReview').send(body);
      const after = await readWithdrawal();
      withdrawalOutcomes.push({ after, before, status: mutation.status });
    }

    expect(invalidReview.status).toBe(400);
    expect(reviewAfter).toEqual(reviewBefore);
    for (const outcome of withdrawalOutcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects audit review without auditIds and keeps the review list unchanged', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDAUDIT1';

    await request(server).post('/label/addLabel').send({
      desc: 'audit validation guard',
      labelcode: labelCode,
      labelname: '审核参数保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    await request(server).get('/label/applyStateSs').query({ labelCode });

    const readReviews = async () => {
      const response = await request(server).post('/audit/reviewInfos').send({
        nowPage: 1,
        pageSize: 100,
        searchWord: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };

    const before = await readReviews();
    expect(before).toEqual(
      expect.arrayContaining([expect.objectContaining({ labelCode, status: 24 })]),
    );

    const invalidReview = await request(server).post('/audit/auditReview').send({
      result: '',
      status: 21,
    });
    const after = await readReviews();

    expect(invalidReview.status).toBe(400);
    expect(after).toEqual(before);
  });

  it('requires a non-blank result when rejecting an audit and keeps the review unchanged', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDRESULT1';

    await request(server).post('/label/addLabel').send({
      desc: 'audit rejection validation guard',
      labelcode: labelCode,
      labelname: '驳回原因保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 0,
    });
    await request(server).get('/label/applyStateSs').query({ labelCode });

    const readReview = async () => {
      const response = await request(server).post('/audit/reviewInfos').send({
        nowPage: 1,
        pageSize: 10,
        searchWord: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list[0];
    };

    const initialReview = await readReview();
    expect(initialReview).toMatchObject({ auditId: expect.any(String), status: 24 });

    for (const result of [undefined, '   ']) {
      const before = await readReview();
      const invalidReview = await request(server)
        .post('/audit/auditReview')
        .send({ auditIds: initialReview.auditId, result, status: 22 });
      const after = await readReview();

      expect(invalidReview.status).toBe(400);
      expect(after).toEqual(before);
    }
  });

  it('rejects incomplete authority mutations and keeps the authorized label list unchanged', async () => {
    const server = app.getHttpServer();
    const readAuthorizedLabels = async () => {
      const response = await request(server).post('/authority/labelinfo').send({
        nowPage: 1,
        pageSize: 100,
        roleCodes: '620000103',
        roleFilterType: 1,
        viewCode: 'UNITAG',
      });
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const invalidRequests = [
      {
        path: '/authority/add/byLabelCode',
        body: { labelCodes: ',，', roleCodes: '620000103' },
      },
      {
        path: '/authority/add/byLabelCode',
        body: { labelCodes: 'ZA005988', roleCodes: ',，' },
      },
      {
        path: '/authority/delete/byLabelCode',
        body: { labelCodes: ',，', roleCodes: '620000103' },
      },
      {
        path: '/authority/delete/byLabelCode',
        body: { labelCodes: 'ZA005988', roleCodes: ',，' },
      },
      { path: '/authority/add/byLabelCode', body: { roleCodes: '620000103' } },
      { path: '/authority/add/byLabelCode', body: { labelCodes: 'ZA005988' } },
      { path: '/authority/delete/byLabelCode', body: { roleCodes: '620000103' } },
      { path: '/authority/delete/byLabelCode', body: { labelCodes: 'ZA005988' } },
    ];
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const invalidRequest of invalidRequests) {
      const before = await readAuthorizedLabels();
      const mutation = await request(server).post(invalidRequest.path).send(invalidRequest.body);
      const after = await readAuthorizedLabels();
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects incomplete category mutations and keeps the label list unchanged', async () => {
    const server = app.getHttpServer();
    const readLabel = async () => {
      const response = await request(server).post('/label/labelinfo').send({
        nowPage: 1,
        pageSize: 10,
        searchKey: 'ZA005988',
        viewCode: 'UNITAG',
      });
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const invalidRequests = [
      { path: '/labelCategory/connect', body: { cateCode: '003', labelCodes: ',，' } },
      {
        path: '/labelCategory/disConnect',
        body: { cateCode: '003', labelCodes: ',，' },
      },
      { path: '/labelCategory/connect', body: { labelCodes: 'ZA005988' } },
      { path: '/labelCategory/connect', body: { cateCode: '003' } },
      { path: '/labelCategory/disConnect', body: { labelCodes: 'ZA005988' } },
      { path: '/labelCategory/disConnect', body: { cateCode: '003' } },
    ];
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const invalidRequest of invalidRequests) {
      const before = await readLabel();
      const mutation = await request(server).post(invalidRequest.path).send(invalidRequest.body);
      const after = await readLabel();
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects label state mutations without labelCode and keeps the label list unchanged', async () => {
    const server = app.getHttpServer();
    const readLabel = async () => {
      const response = await request(server).post('/label/labelinfo').send({
        nowPage: 1,
        pageSize: 10,
        searchKey: 'ZA005988',
        viewCode: 'UNITAG',
      });
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const mutationPaths = [
      '/label/onlineLabel',
      '/label/offlineLabel',
      '/label/suspendLabel',
      '/label/delLabel',
      '/label/applyStateSs',
    ];

    for (const path of mutationPaths) {
      const before = await readLabel();
      const mutation = await request(server).get(path);
      const after = await readLabel();

      expect(mutation.status).toBe(400);
      expect(after).toEqual(before);
    }
  });

  it('rejects reclassifying terminal audits and keeps permissions unchanged', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDTERMINALAUDIT1';
    const roleCode = 'GUARD_TERMINAL_AUDIT_ROLE';
    const setup = await request(server).post('/label/addLabel').send({
      labelcode: labelCode,
      labelname: '终态审核保护标签',
      labeltype: 0,
      shareAttr: 15,
      state: 4,
    });
    expect(setup.status).toBe(200);

    const readApplications = async () => {
      const response = await request(server).post('/audit/auditInfos').send({
        nowPage: 1,
        pageSize: 20,
        searchWord: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list as Array<{ auditId: string; status: number }>;
    };
    const readAudit = async (auditId: string) => {
      const audits = await readApplications();
      return audits.find((audit) => audit.auditId === auditId);
    };
    const readAuthorizedCodes = async () => {
      const response = await request(server).post('/authority/labelinfo').send({
        nowPage: 1,
        pageSize: 20,
        roleCodes: roleCode,
        roleFilterType: 1,
        searchKey: labelCode,
        viewCode: 'UNITAG',
      });
      expect(response.status).toBe(200);
      return (response.body.data.list as Array<{ labelCode: string }>).map(
        (label) => label.labelCode,
      );
    };

    const grantRequest = await request(server).post('/label/applyLabel').send({
      labelCodes: labelCode,
      roleCodes: roleCode,
      vaild: 1,
      validUntil: 0,
    });
    expect(grantRequest.status).toBe(200);
    const pendingGrant = (await readApplications())[0];
    expect(pendingGrant).toMatchObject({ auditId: expect.any(String), status: 24 });
    const approveGrant = await request(server).post('/audit/auditReview').send({
      auditIds: pendingGrant.auditId,
      status: 21,
    });
    expect(approveGrant.status).toBe(200);
    const approvedBefore = await readAudit(pendingGrant.auditId);
    const approvedPermissionsBefore = await readAuthorizedCodes();

    const invalidRejection = await request(server).post('/audit/auditReview').send({
      auditIds: pendingGrant.auditId,
      result: '不允许重复改判',
      status: 22,
    });
    const approvedAfter = await readAudit(pendingGrant.auditId);
    const approvedPermissionsAfter = await readAuthorizedCodes();

    const cancellationRequest = await request(server).post('/label/applyLabel').send({
      labelCodes: labelCode,
      roleCodes: roleCode,
      vaild: 0,
      validUntil: 0,
    });
    expect(cancellationRequest.status).toBe(200);
    const pendingCancellation = (await readApplications())[0];
    expect(pendingCancellation).toMatchObject({ auditId: expect.any(String), status: 24 });
    const withdrawCancellation = await request(server).post('/audit/myApplyReview').send({
      auditIds: pendingCancellation.auditId,
      status: 23,
    });
    expect(withdrawCancellation.status).toBe(200);
    const withdrawnBefore = await readAudit(pendingCancellation.auditId);
    const withdrawnPermissionsBefore = await readAuthorizedCodes();

    const invalidApproval = await request(server).post('/audit/auditReview').send({
      auditIds: pendingCancellation.auditId,
      status: 21,
    });
    const withdrawnAfter = await readAudit(pendingCancellation.auditId);
    const withdrawnPermissionsAfter = await readAuthorizedCodes();

    expect(approvedBefore).toMatchObject({ status: 21 });
    expect(approvedPermissionsBefore).toEqual([labelCode]);
    expect(invalidRejection.status).toBe(400);
    expect(approvedAfter).toEqual(approvedBefore);
    expect(approvedPermissionsAfter).toEqual(approvedPermissionsBefore);
    expect(withdrawnBefore).toMatchObject({ status: 23 });
    expect(withdrawnPermissionsBefore).toEqual([labelCode]);
    expect(invalidApproval.status).toBe(400);
    expect(withdrawnAfter).toEqual(withdrawnBefore);
    expect(withdrawnPermissionsAfter).toEqual(withdrawnPermissionsBefore);
  });

  it('rejects an explicitly duplicated labelcode without overwriting the existing label', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDDUPLICATE1';
    const initialAdd = await request(server).post('/label/addLabel').send({
      categorys: '009001001001',
      createRole: '620000103',
      desc: '重复编码原始描述',
      labelEnName: 'duplicate_guard_original',
      labelalias: '原始别名',
      labelcode: labelCode,
      labelname: '重复编码原始标签',
      labeltype: 0,
      period: '原始周期',
      personDeal: '原始处理',
      personInput: '原始输入',
      personOutput: '原始输出',
      resource: '原始资源',
      shareAttr: 15,
      state: 0,
      version: 'v1',
    });
    expect(initialAdd.status).toBe(200);

    const readDetail = async () => {
      const response = await request(server).get('/label/detail').query({ labelCode });
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const before = await readDetail();
    const duplicateAdd = await request(server).post('/label/addLabel').send({
      desc: '不应覆盖的描述',
      labelcode: labelCode,
      labelname: '不应覆盖的名称',
      labeltype: 3,
      shareAttr: 16,
      state: 6,
      version: 'v2',
    });
    const after = await readDetail();

    expect(duplicateAdd.status).toBe(400);
    expect(after).toEqual(before);
  });

  it('rejects null optional addLabel strings without inserting labels', async () => {
    const server = app.getHttpServer();
    const optionalStringFields = [
      'categorys',
      'createRole',
      'desc',
      'labelEnName',
      'labelalias',
      'labelcode',
      'labelname',
      'period',
      'personDeal',
      'personInput',
      'personOutput',
      'resource',
      'version',
    ] as const;
    const readLabels = async (searchKey: string) => {
      const response = await request(server).post('/label/labelinfo').send({
        nowPage: 1,
        pageSize: 20,
        searchKey,
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const [index, field] of optionalStringFields.entries()) {
      const labelCode = `GUARDNULLADDSTR${index}`;
      const labelName = `新增字符串空值保护${index}`;
      const body: Record<string, unknown> = {
        labelcode: labelCode,
        labelname: labelName,
        labeltype: 0,
        shareAttr: 15,
        state: 0,
      };
      body[field] = null;
      const searchKey = field === 'labelcode' ? labelName : labelCode;
      const before = await readLabels(searchKey);
      const mutation = await request(server).post('/label/addLabel').send(body);
      const after = await readLabels(searchKey);
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects null optional editLabel strings and keeps the label unchanged', async () => {
    const server = app.getHttpServer();
    const labelCode = 'GUARDNULLEDITSTR1';
    const setup = await request(server).post('/label/addLabel').send({
      categorys: '009001001001',
      createRole: '620000103',
      desc: '编辑空值保护原始描述',
      labelEnName: 'null_edit_guard',
      labelalias: '编辑空值保护别名',
      labelcode: labelCode,
      labelname: '编辑空值保护标签',
      labeltype: 0,
      period: '每日',
      personDeal: '处理规则',
      personInput: '输入规则',
      personOutput: '输出规则',
      resource: '资源表',
      shareAttr: 15,
      state: 0,
      version: 'v1',
    });
    expect(setup.status).toBe(200);

    const optionalStringFields = [
      'categorys',
      'createRole',
      'desc',
      'labelEnName',
      'labelalias',
      'labelname',
      'period',
      'personDeal',
      'personInput',
      'personOutput',
      'resource',
      'version',
    ] as const;
    const readDetail = async () => {
      const response = await request(server).get('/label/detail').query({ labelCode });
      expect(response.status).toBe(200);
      return response.body.data;
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const field of optionalStringFields) {
      const before = await readDetail();
      const mutation = await request(server)
        .post('/label/editLabel')
        .send({ labelcode: labelCode, [field]: null });
      const after = await readDetail();
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects null optional category strings and keeps the category unchanged', async () => {
    const server = app.getHttpServer();
    const parentResponse = await request(server).get('/labelCategory/parentCategoryInfo');
    expect(parentResponse.status).toBe(200);
    const categoryId = (parentResponse.body.data[0] as { id: string }).id;
    const optionalStringFields = [
      'desc',
      'filter',
      'name',
      'registerItem',
      'registerRequired',
    ] as const;
    const readCategory = async () => {
      const response = await request(server).get('/labelCategory/parentCategoryInfo');
      expect(response.status).toBe(200);
      return (response.body.data as Array<{ id: string }>).find(
        (category) => category.id === categoryId,
      );
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const field of optionalStringFields) {
      const before = await readCategory();
      const mutation = await request(server)
        .post('/labelCategory/updateCategory')
        .send({ categoryId, [field]: null });
      const after = await readCategory();
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects null optional labelinfo strings without changing query results', async () => {
    const server = app.getHttpServer();
    const optionalStringFields = [
      'categorys',
      'labelType',
      'roleCodes',
      'searchKey',
      'shareType',
      'state',
      'viewCode',
    ] as const;
    const validQuery = {
      nowPage: 1,
      pageSize: 20,
      roleFilterType: 0,
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const field of optionalStringFields) {
      const before = await request(server).post('/label/labelinfo').send(validQuery);
      expect(before.status).toBe(200);
      const invalid = await request(server)
        .post('/label/labelinfo')
        .send({ ...validQuery, [field]: null });
      const after = await request(server).post('/label/labelinfo').send(validQuery);
      expect(after.status).toBe(200);
      outcomes.push({
        after: after.body.data,
        before: before.body.data,
        status: invalid.status,
      });
    }

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
  });

  it('rejects null optional audit and authority strings without changing data', async () => {
    const server = app.getHttpServer();
    const readAudit = async (path: string, labelCode: string) => {
      const response = await request(server).post(path).send({
        nowPage: 1,
        pageSize: 20,
        searchWord: labelCode,
      });
      expect(response.status).toBe(200);
      return response.body.data.list[0];
    };
    const outcomes: Array<{ after: unknown; before: unknown; status: number }> = [];

    for (const [index, field] of ['bcontent', 'result'].entries()) {
      const labelCode = `GUARDNULLREVIEWSTR${index}`;
      const setup = await request(server)
        .post('/label/addLabel')
        .send({
          labelcode: labelCode,
          labelname: `审核字符串空值保护${index}`,
          labeltype: 0,
          shareAttr: 15,
          state: 0,
        });
      expect(setup.status).toBe(200);
      const apply = await request(server).get('/label/applyStateSs').query({ labelCode });
      expect(apply.status).toBe(200);
      const before = await readAudit('/audit/reviewInfos', labelCode);
      const mutation = await request(server)
        .post('/audit/auditReview')
        .send({ auditIds: before.auditId, status: 21, [field]: null });
      const after = await readAudit('/audit/reviewInfos', labelCode);
      outcomes.push({ after, before, status: mutation.status });
    }

    for (const [index, field] of ['bcontent', 'result'].entries()) {
      const labelCode = `GUARDNULLAPPLYSTR${index}`;
      const setup = await request(server)
        .post('/label/addLabel')
        .send({
          labelcode: labelCode,
          labelname: `撤回字符串空值保护${index}`,
          labeltype: 0,
          shareAttr: 15,
          state: 4,
        });
      expect(setup.status).toBe(200);
      const apply = await request(server)
        .post('/label/applyLabel')
        .send({
          labelCodes: labelCode,
          roleCodes: `GUARD_NULL_APPLY_STRING_ROLE_${index}`,
          vaild: 1,
          validUntil: 0,
        });
      expect(apply.status).toBe(200);
      const before = await readAudit('/audit/auditInfos', labelCode);
      const mutation = await request(server)
        .post('/audit/myApplyReview')
        .send({ auditIds: before.auditId, status: 23, [field]: null });
      const after = await readAudit('/audit/auditInfos', labelCode);
      outcomes.push({ after, before, status: mutation.status });
    }

    const authorityLabelCode = 'GUARDNULLAUTHSTR1';
    const authorityRoleCode = 'GUARD_NULL_AUTH_STRING_ROLE';
    const authoritySetup = await request(server).post('/label/addLabel').send({
      labelcode: authorityLabelCode,
      labelname: '权限字符串空值保护',
      labeltype: 0,
      shareAttr: 15,
      state: 4,
    });
    expect(authoritySetup.status).toBe(200);
    const readAuthorized = async () => {
      const response = await request(server).post('/authority/labelinfo').send({
        nowPage: 1,
        pageSize: 20,
        roleCodes: authorityRoleCode,
        roleFilterType: 1,
        searchKey: authorityLabelCode,
        viewCode: 'UNITAG',
      });
      expect(response.status).toBe(200);
      return response.body.data.list;
    };
    const authorityBefore = await readAuthorized();
    const invalidAuthority = await request(server).post('/authority/add/byLabelCode').send({
      labelCodes: authorityLabelCode,
      roleCodes: authorityRoleCode,
      validUntil: 0,
      viewCode: null,
    });
    const authorityAfter = await readAuthorized();

    for (const outcome of outcomes) {
      expect(outcome.status).toBe(400);
      expect(outcome.after).toEqual(outcome.before);
    }
    expect(invalidAuthority.status).toBe(400);
    expect(authorityAfter).toEqual(authorityBefore);
  });

  it('does not expose deprecated or undocumented tag-management endpoints', async () => {
    const server = app.getHttpServer();
    const postOnlyDeprecatedPaths = [
      '/labelCategory/searchCategoryInfo',
      '/audit/applyLabel',
      '/audit/applyLabelState',
      '/audit/auditInfoLists',
      '/audit/review',
      '/open/login/mToken',
      '/sys/realm/list',
      '/labelCategory/saveDimension',
      '/labelCategory/deleteDimension',
      '/labelCategory/saveCategory',
      '/labelCategory/deleteCategory',
      '/labelCategory/assignLabels',
      '/authority/list/byRoleCode',
      '/label/deleteLabel',
      '/labelView/add',
    ];

    for (const path of postOnlyDeprecatedPaths) {
      const response = await request(server).post(path).send({});
      expect(response.status).toBe(404);
    }

    const serviceStats = await request(server).get('/label/resultStatic/service');
    expect(serviceStats.status).toBe(404);
  });
});
