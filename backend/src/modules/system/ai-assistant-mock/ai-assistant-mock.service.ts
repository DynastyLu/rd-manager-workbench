import { Injectable } from '@nestjs/common';
import {
  MockKnowledgeBase,
  MockKnowledgeFile,
  MockSession,
  MockSessionRecord,
  mockKnowledgeBases,
  mockKnowledgeFiles,
  mockSessionRecords,
  mockSessions,
} from './ai-assistant-mock.data';

interface PageRequest {
  nowPage?: unknown;
  pageSize?: unknown;
}

interface KnowledgeSearchRequest extends Record<string, unknown> {
  imgBase64?: unknown;
  knowledgeIdKeys?: unknown;
  limit?: unknown;
  sessionIdKey?: unknown;
  text?: unknown;
  type?: unknown;
}

interface KnowledgeSearchResponse {
  data: Record<string, unknown>;
  msg: string;
}

@Injectable()
export class AiAssistantMockService {
  private readonly knowledgeBases: MockKnowledgeBase[] = [...mockKnowledgeBases];
  private readonly files: MockKnowledgeFile[] = [...mockKnowledgeFiles];
  private readonly sessions: MockSession[] = [...mockSessions];
  private readonly sessionRecords: MockSessionRecord[] = [...mockSessionRecords];

  listKnowledgeBases(params: PageRequest & Record<string, unknown>) {
    const keyword = String(params.knowledgeName || '').trim();
    const filtered = keyword
      ? this.knowledgeBases.filter((item) => item.knowledgeName.includes(keyword))
      : this.knowledgeBases;

    return this.paginate(filtered, params);
  }

  createKnowledgeBase(payload: Record<string, unknown>) {
    const now = this.now();
    const type = Number(payload.type || 0);
    const scope = type === 1 ? 'private' : 'public';
    const id = `${scope}-${Date.now()}`;
    const knowledgeBase: MockKnowledgeBase = {
      idKey: id,
      knowledgeIdKey: id,
      knowledgeName: String(payload.knowledgeName || '未命名知识库').trim(),
      knowledgeType: type === 1 ? 1 : 0,
      remark: '',
      createTime: now,
      updateTime: now,
    };

    this.knowledgeBases.push(knowledgeBase);
    return knowledgeBase;
  }

  updateKnowledgeBase(payload: Record<string, unknown>) {
    const knowledgeIdKey = String(payload.knowledgeIdKey || '');
    const knowledgeBase = this.knowledgeBases.find((item) => item.idKey === knowledgeIdKey);

    if (!knowledgeBase) {
      return null;
    }

    knowledgeBase.knowledgeName = String(payload.knowledgeName || knowledgeBase.knowledgeName).trim();
    knowledgeBase.updateTime = this.now();
    return knowledgeBase;
  }

  deleteKnowledgeBase(knowledgeIdKey?: string) {
    const nextKnowledgeBases = this.knowledgeBases.filter((item) => item.idKey !== knowledgeIdKey);
    this.knowledgeBases.splice(0, this.knowledgeBases.length, ...nextKnowledgeBases);
    return { idKey: knowledgeIdKey || '' };
  }

  listFiles(params: PageRequest & Record<string, unknown>) {
    const knowledgeIdKey = String(params.knowledgeIdKey || '');
    const filtered = this.files.filter((file) => file.knowledgeIdKey === knowledgeIdKey);
    return this.paginate(filtered, params);
  }

  uploadFile(payload: Record<string, unknown>) {
    const knowledgeIdKey = String(payload.knowledgeIdKey || this.knowledgeBases[0]?.idKey || 'unknown');
    const fileName = String(payload.fileName || 'mock-upload-file.txt');
    const now = this.now();
    const id = `file-upload-${Date.now()}`;
    const file: MockKnowledgeFile = {
      idKey: id,
      fileIdKey: id,
      fileKey: id,
      knowledgeIdKey,
      fileName,
      fileSize: 1024,
      fileState: 1,
      fileType: fileName.includes('.') ? fileName.split('.').pop() || 'txt' : 'txt',
      createTime: now,
      updateTime: now,
    };

    this.files.push(file);
    return file;
  }

  deleteFile(params: Record<string, unknown>) {
    const nextFiles = this.files.filter(
      (file) =>
        file.fileKey !== params.fileIdKey ||
        (params.knowledgeIdKey && file.knowledgeIdKey !== params.knowledgeIdKey),
    );
    this.files.splice(0, this.files.length, ...nextFiles);
    return {
      fileIdKey: params.fileIdKey || '',
      knowledgeIdKey: params.knowledgeIdKey || '',
    };
  }

  searchKnowledge(payload: KnowledgeSearchRequest): KnowledgeSearchResponse {
    if (Number(payload.type || 0) === 1) {
      return this.searchAiModel(payload);
    }

    const question = String(payload.text || '').trim();
    const requestedIds = Array.isArray(payload.knowledgeIdKeys)
      ? payload.knowledgeIdKeys.map((item) => String(item || '')).filter(Boolean)
      : [];
    const matchedFiles = this.files
      .filter((file) => !requestedIds.length || requestedIds.includes(file.knowledgeIdKey))
      .slice(0, Number(payload.limit || 10));
    const files = matchedFiles.length ? matchedFiles : this.files.slice(0, 2);
    const summary = question
      ? `关于“${question}”，已在选中的知识库中完成模拟检索。结果包含引用文件、命中文本和可下载文件信息。`
      : '已在选中的知识库中完成模拟检索。结果包含引用文件、命中文本和可下载文件信息。';

    const data = {
      text: `${summary}\n\nmock 接口用于联调 visual-workbench 的知识库搜索链路，字段结构与前端适配层保持一致。`,
      files: files.map((file) => ({
        fileKey: file.fileKey,
        fileIdKey: file.fileIdKey,
        fileName: file.fileName,
        downloadUrl: `/sys/knowledgeFile/downloadFile?fileIdKey=${file.fileKey}`,
      })),
      searchDocs: files.map((file, index) => ({
        fileKey: file.fileKey,
        fileIdKey: file.fileIdKey,
        fileName: file.fileName,
        text: `${file.fileName} 命中“${question || '知识库检索'}”相关内容。`,
        content: `详细内容：这是 ${file.fileName} 的模拟引用正文，用于验证引用展开、复制和下载流程。`,
        downloadUrl: `/sys/knowledgeFile/downloadFile?fileIdKey=${file.fileKey}`,
        score: Number((0.92 - index * 0.05).toFixed(2)),
      })),
    };

    this.appendSearchRecord(String(payload.sessionIdKey || ''), question, data, requestedIds);
    return {
      data,
      msg: 'success',
    };
  }

  listSessions(params: PageRequest & Record<string, unknown>) {
    const keyword = String(params.sessionName || '').trim();
    const filtered = keyword
      ? this.sessions.filter((item) => item.sessionName.includes(keyword))
      : this.sessions;

    return this.paginate(
      [...filtered].sort((left, right) => right.updateTime.localeCompare(left.updateTime)),
      params,
    );
  }

  createSession(payload: Record<string, unknown>) {
    const now = this.now();
    const id = `session-${Date.now()}`;
    const session: MockSession = {
      idKey: id,
      sessionIdKey: id,
      sessionName: String(payload.sessionName || '新会话').trim(),
      createTime: now,
      updateTime: now,
    };

    this.sessions.unshift(session);
    return session;
  }

  getSessionDetail(sessionIdKey?: string) {
    return this.sessionRecords.filter(
      (record) => record.parentId === sessionIdKey || record.sessionIdKey === sessionIdKey,
    );
  }

  updateSession(payload: Record<string, unknown>) {
    const sessionIdKey = String(payload.sessionIdKey || '');
    const session = this.sessions.find((item) => item.sessionIdKey === sessionIdKey);

    if (!session) {
      return null;
    }

    session.sessionName = String(payload.sessionName || payload.title || session.sessionName).trim();
    session.updateTime = this.now();
    return session;
  }

  deleteSession(idKey?: string) {
    const nextSessions = this.sessions.filter(
      (item) => item.idKey !== idKey && item.sessionIdKey !== idKey,
    );
    const nextRecords = this.sessionRecords.filter(
      (item) => item.parentId !== idKey && item.sessionIdKey !== idKey,
    );

    this.sessions.splice(0, this.sessions.length, ...nextSessions);
    this.sessionRecords.splice(0, this.sessionRecords.length, ...nextRecords);

    return { idKey: idKey || '' };
  }

  clearSession(idKey?: string) {
    const nextRecords = this.sessionRecords.filter(
      (item) => item.parentId !== idKey && item.sessionIdKey !== idKey,
    );
    this.sessionRecords.splice(0, this.sessionRecords.length, ...nextRecords);

    const session = this.sessions.find((item) => item.idKey === idKey || item.sessionIdKey === idKey);
    if (session) {
      session.updateTime = this.now();
      return session;
    }

    return {
      idKey: idKey || '',
      sessionIdKey: idKey || '',
      sessionName: '新会话',
      createTime: this.now(),
      updateTime: this.now(),
    };
  }

  private paginate<T>(items: T[], params: PageRequest) {
    const nowPage = Math.max(Number(params.nowPage || 1), 1);
    const pageSize = Math.max(Number(params.pageSize || items.length || 10), 1);
    const start = (nowPage - 1) * pageSize;
    const list = items.slice(start, start + pageSize);
    const total = items.length;

    return {
      list,
      nowPage,
      pageSize,
      total,
      pageCount: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  private appendSearchRecord(
    sessionIdKey: string | undefined,
    question: string,
    searchResult: unknown,
    knowledgeIdKeys: string[],
  ) {
    if (!sessionIdKey) {
      return;
    }

    const session = this.sessions.find((item) => item.sessionIdKey === sessionIdKey);
    if (!session) {
      return;
    }

    const now = this.now();
    session.updateTime = now;
    const selectedKnowledgeBases = this.knowledgeBases
      .filter((item) => knowledgeIdKeys.includes(item.idKey))
      .map((item) => ({
        id: item.idKey,
        name: item.knowledgeName,
      }));

    this.sessionRecords.push({
      idKey: `record-${Date.now()}`,
      parentId: session.sessionIdKey,
      sessionIdKey: session.sessionIdKey,
      sessionName: session.sessionName,
      sortNum: this.sessionRecords.length + 1,
      sessionParam: JSON.stringify({ text: question }),
      sessionRet: JSON.stringify({
        ...(typeof searchResult === 'object' && searchResult !== null ? searchResult : {}),
        knowledgeIdKeys,
        knowledgeBases: selectedKnowledgeBases,
      }),
      createTime: now,
      updateTime: now,
    });
  }

  private now() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  private searchAiModel(payload: KnowledgeSearchRequest): KnowledgeSearchResponse {
    const question = String(payload.text || '').trim() || '身份识别';
    const imgBase64 = String(payload.imgBase64 || '').trim();

    if (this.isSystemPromptQuery(question)) {
      return this.createSystemPromptResponse(payload, question);
    }

    if (this.isVehicleTrackQuery(question)) {
      return this.createAiToolResponse(
        payload,
        question,
        '001001004',
        this.createVehicleTrackPayload(question),
        '已根据车牌、时间和设备/地点条件返回车辆轨迹结果。',
      );
    }

    if (this.isPersonTrackQuery(question)) {
      return this.createAiToolResponse(
        payload,
        question,
        '001001003',
        this.createPersonTrackPayload(question),
        '已根据人员身份、时间和设备/地点条件返回人员轨迹结果。',
      );
    }

    if (this.isVideoQuery(question)) {
      return this.createAiToolResponse(
        payload,
        question,
        '001001001',
        this.createVideoQueryPayload(question),
        '已根据查询内容返回可调阅的摄像头列表。',
      );
    }

    if (!this.isIdentityQuery(question)) {
      return this.createRandomAiToolResponse(payload, question);
    }

    return this.createIdentityResponse(payload, question, imgBase64);
  }

  private createIdentityResponse(
    payload: KnowledgeSearchRequest,
    question: string,
    imgBase64 = '',
  ): KnowledgeSearchResponse {
    const idCard = this.extractIdCard(question);
    const identityPayload = {
      imgBase64: this.createMockImageDataUri('FACE', '#4f8cff', '#dbe8ff'),
      name: '张三',
      idCard: idCard || '440100199001011234',
      score: 0.89,
      libName: '重点人员库',
      hj: '广东省广州市',
      reqParam: imgBase64
        ? {
            type: 2,
            imgBase64,
          }
        : {
            type: 1,
            idCard: idCard || question,
          },
    };
    const data = {
      text: JSON.stringify(identityPayload),
      files: [],
      searchDocs: [],
      toolCode: '001001002',
    };

    this.appendSearchRecord(String(payload.sessionIdKey || ''), question, data, []);

    return {
      data,
      msg: 'success',
    };
  }

  private createSystemPromptResponse(
    payload: KnowledgeSearchRequest,
    question: string,
  ): KnowledgeSearchResponse {
    const data = {
      text: `系统提示语：${question || '请先选择功能或上传图片。'}`,
      files: [],
      searchDocs: [],
      toolCode: '001001000',
    };

    this.appendSearchRecord(String(payload.sessionIdKey || ''), question, data, []);

    return {
      data,
      msg: 'success',
    };
  }

  private createRandomAiToolResponse(
    payload: KnowledgeSearchRequest,
    question: string,
  ): KnowledgeSearchResponse {
    const toolCodes = ['001001001', '001001002', '001001003', '001001004'];
    const toolCode = toolCodes[Math.floor(Math.random() * toolCodes.length)];

    if (toolCode === '001001001') {
      return this.createAiToolResponse(
        payload,
        question,
        toolCode,
        this.createVideoQueryPayload(question),
        '已随机返回视频调阅模拟结果。',
      );
    }

    if (toolCode === '001001003') {
      return this.createAiToolResponse(
        payload,
        question,
        toolCode,
        this.createPersonTrackPayload(question),
        '已随机返回人员轨迹模拟结果。',
      );
    }

    if (toolCode === '001001004') {
      return this.createAiToolResponse(
        payload,
        question,
        toolCode,
        this.createVehicleTrackPayload(question),
        '已随机返回车辆轨迹模拟结果。',
      );
    }

    return this.createIdentityResponse(
      payload,
      question,
      String(payload.imgBase64 || '').trim(),
    );
  }

  private createAiToolResponse(
    payload: KnowledgeSearchRequest,
    question: string,
    toolCode: string,
    toolPayload: Record<string, unknown>,
    summary: string,
  ): KnowledgeSearchResponse {
    void summary;
    const data = {
      text: JSON.stringify(toolPayload),
      files: [],
      searchDocs: [],
      toolCode,
    };

    this.appendSearchRecord(String(payload.sessionIdKey || ''), question, data, []);

    return {
      data,
      msg: 'success',
    };
  }

  private createPersonTrackPayload(question: string) {
    const idCard = this.extractIdCard(question) || '123456789123456789';
    const { startTime, endTime } = this.extractTimeRange(question);
    return {
      imgBase64: this.createMockImageDataUri('PERSON', '#4f8cff', '#dbe8ff'),
      name: '王五',
      idCard,
      score: 0.9957,
      libName: '重点人员库',
      hj: '广东省广州市',
      aiMsg: 'AI总结：已命中该人员在指定时间范围内的重点点位记录，建议结合轨迹页面继续核查同行和高频出现点。',
      reqParam: {
        type: 1,
        idCard,
        startTime,
        endTime,
        devices: this.createMockDeviceIds(question),
      },
    };
  }

  private createVehicleTrackPayload(question: string) {
    const plateNo = this.extractPlateNo(question) || '甘AF13897';
    const keyword = this.extractDeviceKeyword(question);
    return {
      plateNumber: plateNo,
      plateColor: '9',
      shotTime: '2026-07-02 08:49:04',
      shotImgUrl:
        'http://192.168.39.130:30001/st/image/face/upload/v2/vehicle/2026/7/2/8/0/MSoVRozN8pyv9TeIFkf4vE4qLUpvDTVMxEUia7VSmb0WTUthVGvVLcYh6njqEa9B',
      shotPlace: 'A102810314-1 7Q兰州城关旧大路颜家沟清真寺东南球',
      owner: '姜辰昕',
      idCard: '620423199609131020',
      aiMsg:
        '基于您提供的车辆轨迹数据，以下是该车辆的出行规律总结：\n\n' +
        '### 1. 抓拍总次数\n' +
        '该车辆在当前查询时间范围内（2026-06-29 至 2026-07-02）共被抓拍 **11** 次。\n\n' +
        '### 2. 抓拍次数最多的日期\n' +
        '* **日期**：2026-07-01\n' +
        '* **次数**：4 次\n' +
        '* **详情**：该日分别在 08:41、08:48、19:13、19:14 四个时间点被抓拍。\n\n' +
        '### 3. 出现频率最高的所属区域\n' +
        '* **区域**：兰州市城关区\n' +
        '* **分析**：所有 11 次抓拍记录均位于“兰州市城关区”，因此该区域为高频出现区域。\n\n' +
        '### 4. 当前最后出现的位置\n' +
        '* **位置描述**：兰州市城关区，颜家沟清真寺东南球（旧大路）\n' +
        '* **设备名称**：A102810314-1 7Q 兰州城关旧大路颜家沟清真寺东南球\n' +
        '* **时间**：2026-07-02 08:49:04\n' +
        '* **坐标**：36.048181, 103.833062\n\n' +
        '### 5. 昼夜出行规律分析\n' +
        '* **白天**：主要集中在甘南路及其周边路口，且多集中在早晨通勤时段。\n' +
        '* **晚上**：同样集中在甘南路沿线，时间集中在傍晚至夜间。\n\n' +
        '### 6. 高频出现的时间段\n' +
        '* **主要时间段**：**08:40 - 09:00** 和 **19:00 - 19:15**。',
      reqParam: {
        plateNumber: plateNo,
        startTime: '2026-06-29 16:24:00',
        endTime: '2026-07-02 16:24:00',
        distance: 0,
        keyword,
        devices: this.createMockDeviceIds(question),
      },
    };
  }

  private createVideoQueryPayload(question: string) {
    const keyword = this.extractDeviceKeyword(question) || '中山桥';
    const names = [
      `${keyword}东侧摄像头`,
      `${keyword}西侧摄像头`,
      `${keyword}北侧路口摄像头`,
      `${keyword}南侧广场摄像头`,
      `${keyword}人行道摄像头`,
      `${keyword}桥面摄像头`,
      `${keyword}周界摄像头`,
    ];
    return {
      type: '2',
      name: keyword,
      longitude: 103.814002,
      latitude: 36.066004,
      address: '甘肃省兰州市城关区中山桥',
      province: '甘肃省',
      city: '兰州市',
      county: '城关区',
      adcode: '620102',
      devices: {
        list: names.map((name, index) => ({
          deviceId: `camera-${index + 1}`,
          deviceName: name,
          longitude: 103.814002 + index * 0.00016,
          latitude: 36.066004 + index * 0.00012,
          type: String((index % 4) + 1),
          previewUrl: this.createMockImageDataUri(`CAM ${index + 1}`, '#1f2f46', '#d8e6ff'),
          status: index % 3 === 0 ? 'online' : 'idle',
        })),
      },
      reqParam: {
        distance: 0,
        keyword,
      },
    };
  }

  private isSystemPromptQuery(text: string) {
    return /系统提示|提示语/.test(text);
  }

  private isVideoQuery(text: string) {
    return /视频|调阅|摄像头|设备|监控/.test(text);
  }

  private isVehicleTrackQuery(text: string) {
    return /车辆|车牌|过车|汽车/.test(text);
  }

  private isPersonTrackQuery(text: string) {
    return /人员|人脸|轨迹|身份证/.test(text) && !this.isVehicleTrackQuery(text);
  }

  private isIdentityQuery(text: string) {
    return /身份识别|识别身份|图片识别|人像识别/.test(text);
  }

  private extractIdCard(text: string) {
    return text.match(/\b\d{17}[\dXx]\b|\b\d{15}\b/)?.[0] || '';
  }

  private extractPlateNo(text: string) {
    return text.match(/[\u4e00-\u9fa5][A-Z][A-Z0-9]{5,6}/i)?.[0] || '';
  }

  private extractTimeRange(text: string) {
    const matches = text.match(/20\d{2}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}:\d{2}/g) || [];
    return {
      startTime: matches[0] || '2025-10-11 15:35:48',
      endTime: matches[1] || '2025-10-14 14:36:57',
    };
  }

  private createMockDeviceIds(text: string) {
    const keyword = this.extractDeviceKeyword(text);
    return keyword ? ['camera-001', 'camera-002'] : [];
  }

  private extractDeviceKeyword(text: string) {
    const normalized = text
      .replace(/视频调阅|设备查询|查询|摄像头|监控|视频|调阅|附近|周边|人员轨迹|车辆轨迹|人脸轨迹|身份证号|车牌号|时间范围|设备名称关键字|地点/g, ' ')
      .replace(/[，。,.]/g, ' ')
      .trim();
    return normalized.split(/\s+/).find(Boolean) || '';
  }

  private createMockImageDataUri(label: string, foreground: string, background: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="190" viewBox="0 0 320 190"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="${foreground}"/></linearGradient></defs><rect width="320" height="190" rx="10" fill="url(#g)"/><path d="M0 145L78 84L126 120L185 58L320 142V190H0Z" fill="rgba(255,255,255,.38)"/><circle cx="246" cy="54" r="24" fill="rgba(255,255,255,.42)"/><text x="24" y="42" fill="#fff" font-size="24" font-family="Arial, sans-serif" font-weight="700">${label}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
