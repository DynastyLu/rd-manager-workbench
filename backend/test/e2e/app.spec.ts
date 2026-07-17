import { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'node:events';
import request from 'supertest';
import { closeE2eApp, createE2eApp } from './helpers/e2e-app';

describe('App e2e smoke', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const tenantKeys = new Set<string>();

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
  });

  afterAll(async () => {
    if (prisma && tenantKeys.size > 0) {
      await prisma.tenant.deleteMany({
        where: { key: { in: Array.from(tenantKeys) } },
      });
    }
    await closeE2eApp(app, prisma);
  });

  it('exposes health and a tenant-scoped user creation path', async () => {
    const health = await invokeHttp(app, {
      method: 'GET',
      url: '/api/health',
    });
    expect(health.body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        service: 'backend-core-platform',
      },
    });

    const tenantKey = `e2e-acme-${Date.now()}`;
    tenantKeys.add(tenantKey);

    const createdTenant = await invokeHttp(app, {
      method: 'POST',
      url: '/api/platform/tenants',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        name: 'E2E Acme Corporation',
        key: tenantKey,
      },
    });

    const tenant = (createdTenant.body as any).data;
    const persistedTenant = await prisma.tenant.findUnique({
      where: { key: tenantKey },
    });

    expect(persistedTenant).toMatchObject({
      id: tenant.id,
      key: tenantKey,
      name: 'E2E Acme Corporation',
      schemaName: tenant.schemaName,
      status: tenant.status,
    });

    const createdUser = await invokeHttp(app, {
      method: 'POST',
      url: '/api/iam/users',
      headers: {
        'x-request-scope': 'tenant',
        'x-tenant-id': tenant.id,
        'x-tenant-key': tenant.key,
        'x-operator-id': 'operator-01',
        'x-operator-type': 'tenant_admin',
        'content-type': 'application/json',
      },
      body: {
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        roleKeys: ['tenant_admin'],
      },
    });

    expect(createdUser.body).toMatchObject({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantKey,
        email: 'ada@example.com',
        displayName: 'Ada Lovelace',
        roleKeys: ['tenant_admin'],
      },
    });
  });

  it('exposes same-address AI assistant knowledge base mock endpoints', async () => {
    const knowledgeBases = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/getList',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        nowPage: 1,
        pageSize: 999,
      },
    });

    expect(knowledgeBases.body).not.toHaveProperty('success');
    expect(knowledgeBases.body).toMatchObject({
      code: 200,
      msg: 'success',
    });
    expect((knowledgeBases.body as any).data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idKey: expect.any(String),
          knowledgeName: expect.any(String),
          knowledgeType: expect.any(Number),
        }),
      ]),
    );

    const firstKnowledgeBase = (knowledgeBases.body as any).data.list[0];
    const files = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledgeFile/getList',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKey: firstKnowledgeBase.idKey,
        nowPage: 1,
        pageSize: 5,
      },
    });

    expect(files.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        nowPage: 1,
        pageSize: 5,
        total: expect.any(Number),
        pageCount: expect.any(Number),
      },
    });
    expect((files.body as any).data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idKey: expect.any(String),
          fileKey: expect.any(String),
          fileName: expect.any(String),
          knowledgeIdKey: firstKnowledgeBase.idKey,
        }),
      ]),
    );

    const search = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKeys: [firstKnowledgeBase.idKey],
        limit: 10,
        text: '知识库检索怎么展示引用',
      },
    });

    expect(search.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        text: expect.any(String),
        files: [
          {
            fileKey: expect.any(String),
            fileName: expect.any(String),
          },
        ],
        searchDocs: [
          {
            fileKey: expect.any(String),
            fileName: expect.any(String),
            text: expect.any(String),
            content: expect.any(String),
          },
        ],
      },
    });

    const identitySearch = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        imgBase64: 'mock-face-image-base64',
        knowledgeIdKeys: [],
        limit: 10,
        sessionIdKey: '',
        text: '身份识别',
        type: 1,
      },
    });

    expect(identitySearch.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        text: expect.any(String),
        files: [],
        searchDocs: [],
        toolCode: '001001002',
      },
    });
    const identityPayload = JSON.parse((identitySearch.body as any).data.text);
    expect(identityPayload).toMatchObject({
      imgBase64: expect.stringContaining('data:image/svg+xml'),
      name: expect.any(String),
      idCard: expect.any(String),
      score: expect.any(Number),
      libName: expect.any(String),
      hj: expect.any(String),
      reqParam: {
        type: 2,
        imgBase64: 'mock-face-image-base64',
      },
    });

    const largeIdentitySearch = await request(app.getHttpServer())
      .post('/sys/knowledge/fileSearch')
      .send({
        imgBase64: 'a'.repeat(150 * 1024),
        knowledgeIdKeys: [],
        limit: 10,
        sessionIdKey: '',
        text: '身份识别',
        type: 1,
      });

    expect(largeIdentitySearch.status).toBe(200);
    expect(largeIdentitySearch.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        text: expect.any(String),
        files: [],
        searchDocs: [],
        toolCode: '001001002',
      },
    });

    const personTrackSearch = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKeys: [],
        limit: 10,
        sessionIdKey: '',
        text: '人员轨迹',
        type: 1,
      },
    });

    expect(personTrackSearch.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        toolCode: '001001003',
        text: expect.any(String),
      },
    });
    const personTrackPayload = JSON.parse((personTrackSearch.body as any).data.text);
    expect(personTrackPayload).toMatchObject({
      imgBase64: expect.stringContaining('data:image/svg+xml'),
      name: expect.any(String),
      idCard: expect.any(String),
      score: expect.any(Number),
      libName: expect.any(String),
      hj: expect.any(String),
      aiMsg: expect.any(String),
      reqParam: expect.objectContaining({
        type: 1,
        idCard: expect.any(String),
        startTime: expect.any(String),
        endTime: expect.any(String),
        devices: expect.any(Array),
      }),
    });

    const vehicleTrackSearch = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKeys: [],
        limit: 10,
        sessionIdKey: '',
        text: '车辆轨迹',
        type: 1,
      },
    });

    expect(vehicleTrackSearch.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        toolCode: '001001004',
        text: expect.any(String),
      },
    });
    const vehicleTrackPayload = JSON.parse((vehicleTrackSearch.body as any).data.text);
    expect(vehicleTrackPayload).toMatchObject({
      plateNumber: '甘AF13897',
      plateColor: '9',
      shotTime: '2026-07-02 08:49:04',
      shotImgUrl: expect.stringContaining('/st/image/face/upload/v2/vehicle/'),
      shotPlace: 'A102810314-1 7Q兰州城关旧大路颜家沟清真寺东南球',
      owner: '姜辰昕',
      idCard: '620423199609131020',
      aiMsg: expect.stringContaining('### 1. 抓拍总次数'),
      reqParam: expect.objectContaining({
        plateNumber: '甘AF13897',
        distance: 0,
        keyword: '',
        startTime: '2026-06-29 16:24:00',
        endTime: '2026-07-02 16:24:00',
        devices: expect.any(Array),
      }),
    });
    expect(vehicleTrackPayload.aiMsg).toContain('**11**');

    const videoSearch = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKeys: [],
        limit: 10,
        sessionIdKey: '',
        text: '视频调阅',
        type: 1,
      },
    });

    expect(videoSearch.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        toolCode: '001001001',
        text: expect.any(String),
      },
    });
    const videoPayload = JSON.parse((videoSearch.body as any).data.text);
    expect(videoPayload).toMatchObject({
      type: '2',
      name: expect.any(String),
      longitude: expect.any(Number),
      latitude: expect.any(Number),
      address: expect.any(String),
      province: expect.any(String),
      city: expect.any(String),
      county: expect.any(String),
      adcode: expect.any(String),
      devices: {
        list: expect.arrayContaining([
          expect.objectContaining({
            deviceId: expect.any(String),
            deviceName: expect.any(String),
            longitude: expect.any(Number),
            latitude: expect.any(Number),
            type: expect.any(String),
            previewUrl: expect.stringContaining('data:image/svg+xml'),
          }),
        ]),
      },
      reqParam: {
        distance: expect.any(Number),
        keyword: expect.any(String),
      },
    });

    const systemPromptSearch = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKeys: [],
        limit: 10,
        sessionIdKey: '',
        text: '系统提示语',
        type: 1,
      },
    });

    expect(systemPromptSearch.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        toolCode: '001001000',
        text: expect.stringContaining('系统提示语'),
        files: [],
        searchDocs: [],
      },
    });
    expect(() => JSON.parse((systemPromptSearch.body as any).data.text)).toThrow();

    const randomAiSearch = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKeys: [],
        limit: 10,
        sessionIdKey: '',
        text: '帮我看一下这个业务结果',
        type: 1,
      },
    });

    expect(randomAiSearch.body).toMatchObject({
      code: 200,
      data: {
        toolCode: expect.any(String),
      },
    });
    expect(['001001001', '001001002', '001001003', '001001004']).toContain(
      (randomAiSearch.body as any).data.toolCode,
    );
    expect((randomAiSearch.body as any).msg).toBe('success');
    expect(() => JSON.parse((randomAiSearch.body as any).data.text)).not.toThrow();
  });

  it('exposes same-address AI assistant conversation mock endpoints', async () => {
    const list = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledgeSession/getList',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        nowPage: 1,
        pageSize: 50,
        sessionName: '',
      },
    });

    expect(list.body).not.toHaveProperty('success');
    expect(list.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        list: expect.any(Array),
      },
    });

    const created = await invokeHttp(app, {
      method: 'POST',
      url: '/sys/knowledgeSession/addSession',
      headers: {
        'content-type': 'application/json',
      },
      body: {},
    });

    expect(created.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        idKey: expect.any(String),
        sessionIdKey: expect.any(String),
        sessionName: expect.any(String),
      },
    });

    const sessionIdKey = (created.body as any).data.sessionIdKey;
    const detail = await invokeHttp(app, {
      method: 'GET',
      url: `/sys/knowledgeSession/getSessionDetail?sessionIdKey=${sessionIdKey}`,
    });

    expect(detail.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: expect.any(Array),
    });

    const cleared = await invokeHttp(app, {
      method: 'GET',
      url: `/sys/knowledgeSession/clear?idKey=${sessionIdKey}`,
    });

    expect(cleared.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        idKey: sessionIdKey,
        sessionName: expect.any(String),
      },
    });
  });

  it('supports visual-workbench szApp-prefixed AI assistant endpoints', async () => {
    const knowledgeBases = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledge/getList',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        nowPage: 1,
        pageSize: 999,
      },
    });

    expect(knowledgeBases.body).not.toHaveProperty('success');
    expect(knowledgeBases.body).toMatchObject({
      code: 200,
      msg: 'success',
    });
    expect((knowledgeBases.body as any).data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idKey: expect.any(String),
          knowledgeName: expect.any(String),
        }),
      ]),
    );

    const search = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKeys: [(knowledgeBases.body as any).data.list[0].idKey],
        limit: 10,
        text: 'visual-workbench 直接调用',
      },
    });

    expect(search.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        text: expect.any(String),
        files: expect.any(Array),
        searchDocs: expect.any(Array),
      },
    });

    const sessions = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledgeSession/getList',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        nowPage: 1,
        pageSize: 50,
        sessionName: '',
      },
    });

    expect(sessions.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        list: expect.any(Array),
      },
    });

    const relativeProjectConfigPath = await invokeHttp(app, {
      method: 'POST',
      url: '/workbench/zxdzszyy/sys/knowledge/getList',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        nowPage: 1,
        pageSize: 999,
      },
    });

    expect(relativeProjectConfigPath.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        list: expect.any(Array),
      },
    });
  });

  it('covers every AI assistant mock mutation and download endpoint', async () => {
    const createdKnowledgeBase = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledge/addKnowledge',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeName: '联调新增知识库',
        type: 1,
      },
    });

    expect(createdKnowledgeBase.body).toMatchObject({
      code: 200,
      msg: 'success',
      data: {
        idKey: expect.any(String),
        knowledgeName: '联调新增知识库',
        knowledgeType: 1,
      },
    });

    const knowledgeIdKey = (createdKnowledgeBase.body as any).data.idKey;
    const updatedKnowledgeBase = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledge/updateKnowledge',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKey,
        knowledgeName: '联调更新知识库',
      },
    });

    expect(updatedKnowledgeBase.body).toMatchObject({
      code: 200,
      data: {
        idKey: knowledgeIdKey,
        knowledgeName: '联调更新知识库',
      },
    });

    const uploadedFile = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledgeFile/uploadFile',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        knowledgeIdKey,
        fileName: '联调上传文件.txt',
      },
    });

    expect(uploadedFile.body).toMatchObject({
      code: 200,
      data: {
        fileKey: expect.any(String),
        knowledgeIdKey,
        fileName: '联调上传文件.txt',
      },
    });

    const fileKey = (uploadedFile.body as any).data.fileKey;
    const downloadedFile = await invokeHttp(app, {
      method: 'GET',
      url: `/zxdzszyy/sys/knowledgeFile/downloadFile?fileIdKey=${fileKey}`,
    });

    expect(downloadedFile.statusCode).toBe(200);
    expect(downloadedFile.body).toBe(`mock download content for ${fileKey}`);

    const deletedFile = await invokeHttp(app, {
      method: 'POST',
      url: `/zxdzszyy/sys/knowledgeFile/delFile?fileIdKey=${fileKey}&knowledgeIdKey=${knowledgeIdKey}`,
    });

    expect(deletedFile.body).toMatchObject({
      code: 200,
      data: {
        fileIdKey: fileKey,
        knowledgeIdKey,
      },
    });

    const deletedKnowledgeBase = await invokeHttp(app, {
      method: 'POST',
      url: `/zxdzszyy/sys/knowledge/delKnowledge?knowledgeIdKey=${knowledgeIdKey}`,
    });

    expect(deletedKnowledgeBase.body).toMatchObject({
      code: 200,
      data: {
        idKey: knowledgeIdKey,
      },
    });

    const createdSession = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledgeSession/addSession',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        sessionName: '联调会话',
      },
    });

    expect(createdSession.body).toMatchObject({
      code: 200,
      data: {
        sessionIdKey: expect.any(String),
        sessionName: '联调会话',
      },
    });

    const sessionIdKey = (createdSession.body as any).data.sessionIdKey;
    const updatedSession = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledgeSession/updateKnowledgeSession',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        sessionIdKey,
        sessionName: '联调会话-更新',
      },
    });

    expect(updatedSession.body).toMatchObject({
      code: 200,
      data: {
        sessionIdKey,
        sessionName: '联调会话-更新',
      },
    });

    const message = await invokeHttp(app, {
      method: 'POST',
      url: '/zxdzszyy/sys/knowledge/fileSearch',
      headers: {
        'content-type': 'application/json',
      },
      body: {
        sessionIdKey,
        knowledgeIdKeys: ['private-visual-workbench'],
        limit: 10,
        text: '会话内提问',
      },
    });

    expect(message.body).toMatchObject({
      code: 200,
      data: {
        text: expect.stringContaining('会话内提问'),
      },
    });

    const detail = await invokeHttp(app, {
      method: 'GET',
      url: `/zxdzszyy/sys/knowledgeSession/getSessionDetail?sessionIdKey=${sessionIdKey}`,
    });

    expect((detail.body as any).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentId: sessionIdKey,
          sessionParam: expect.stringContaining('会话内提问'),
          sessionRet: expect.stringContaining('private-visual-workbench'),
        }),
      ]),
    );

    const deletedSession = await invokeHttp(app, {
      method: 'POST',
      url: `/zxdzszyy/sys/knowledgeSession/delKnowledgeSession?idKey=${sessionIdKey}`,
    });

    expect(deletedSession.body).toMatchObject({
      code: 200,
      data: {
        idKey: sessionIdKey,
      },
    });
  });
});

async function invokeHttp(
  app: INestApplication,
  options: {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
) {
  const expressApp = app.getHttpAdapter().getInstance();
  const requestHeaders = options.headers ?? {};
  const response = createMockResponse();
  const requestObject: any = new EventEmitter();

  requestObject.method = options.method;
  requestObject.url = options.url;
  requestObject.headers = requestHeaders;
  requestObject.ip = '127.0.0.1';
  requestObject.body = options.body;
  requestObject.get = (name: string) => requestHeaders[name.toLowerCase()];

  const result = await new Promise<{ statusCode: number; body: unknown }>((resolve, reject) => {
    response.once('finish', () => {
      resolve({
        statusCode: response.statusCode,
        body: response.body,
      });
    });

    try {
      expressApp(requestObject, response, (error?: unknown) => {
        if (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });

  return result;
}

function createMockResponse() {
  const response: any = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.status = (code: number) => {
    response.statusCode = code;
    return response;
  };
  response.setHeader = (name: string, value: string) => {
    response.headers[name.toLowerCase()] = value;
  };
  response.getHeader = (name: string) => response.headers[name.toLowerCase()];
  response.json = (body: unknown) => {
    response.body = body;
    response.emit('finish');
    return response;
  };
  response.send = response.json;
  response.end = (body?: unknown) => {
    if (body !== undefined && response.body === undefined) {
      response.body = body;
    }
    response.emit('finish');
    return response;
  };
  return response;
}
