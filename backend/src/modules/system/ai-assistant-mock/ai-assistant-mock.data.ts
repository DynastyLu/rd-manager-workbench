export type KnowledgeType = 0 | 1;

export interface MockKnowledgeBase {
  idKey: string;
  knowledgeIdKey: string;
  knowledgeName: string;
  knowledgeType: KnowledgeType;
  remark: string;
  createTime: string;
  updateTime: string;
}

export interface MockKnowledgeFile {
  idKey: string;
  fileIdKey: string;
  fileKey: string;
  knowledgeIdKey: string;
  fileName: string;
  fileSize: number;
  fileState: number;
  fileType: string;
  createTime: string;
  updateTime: string;
}

export interface MockSession {
  idKey: string;
  sessionIdKey: string;
  sessionName: string;
  createTime: string;
  updateTime: string;
}

export interface MockSessionRecord {
  idKey: string;
  parentId: string;
  sessionIdKey: string;
  sessionName: string;
  sortNum: number;
  sessionParam: string;
  sessionRet: string;
  createTime: string;
  updateTime: string;
}

export const mockKnowledgeBases: MockKnowledgeBase[] = [
  {
    idKey: 'public-operations',
    knowledgeIdKey: 'public-operations',
    knowledgeName: '公共知识库-系统运维',
    knowledgeType: 0,
    remark: '运维巡检、告警处置和部署说明资料',
    createTime: '2026-05-01 09:00:00',
    updateTime: '2026-05-08 09:00:00',
  },
  {
    idKey: 'public-product',
    knowledgeIdKey: 'public-product',
    knowledgeName: '公共知识库-产品文档',
    knowledgeType: 0,
    remark: '产品说明、交互流程和 FAQ',
    createTime: '2026-05-01 09:10:00',
    updateTime: '2026-05-08 09:10:00',
  },
  {
    idKey: 'private-visual-workbench',
    knowledgeIdKey: 'private-visual-workbench',
    knowledgeName: '我的知识库-visual-workbench',
    knowledgeType: 1,
    remark: 'visual-workbench AI 助手接入资料',
    createTime: '2026-05-01 09:20:00',
    updateTime: '2026-05-08 09:20:00',
  },
  {
    idKey: 'private-ai-demo',
    knowledgeIdKey: 'private-ai-demo',
    knowledgeName: '我的知识库-AI接入方案',
    knowledgeType: 1,
    remark: '知识库检索、引用展示和会话链路资料',
    createTime: '2026-05-01 09:30:00',
    updateTime: '2026-05-08 09:30:00',
  },
];

export const mockKnowledgeFiles: MockKnowledgeFile[] = [
  {
    idKey: 'file-op-1',
    fileIdKey: 'file-op-1',
    fileKey: 'file-op-1',
    knowledgeIdKey: 'public-operations',
    fileName: '告警处置规范.docx',
    fileSize: 18240,
    fileState: 1,
    fileType: 'docx',
    createTime: '2026-05-07 10:00:00',
    updateTime: '2026-05-07 10:00:00',
  },
  {
    idKey: 'file-prod-1',
    fileIdKey: 'file-prod-1',
    fileKey: 'file-prod-1',
    knowledgeIdKey: 'public-product',
    fileName: '产品功能说明书.docx',
    fileSize: 48321,
    fileState: 1,
    fileType: 'docx',
    createTime: '2026-05-07 10:10:00',
    updateTime: '2026-05-07 10:10:00',
  },
  {
    idKey: 'file-vw-1',
    fileIdKey: 'file-vw-1',
    fileKey: 'file-vw-1',
    knowledgeIdKey: 'private-visual-workbench',
    fileName: 'visual-workbench接入说明.md',
    fileSize: 9312,
    fileState: 1,
    fileType: 'md',
    createTime: '2026-05-07 10:20:00',
    updateTime: '2026-05-07 10:20:00',
  },
  {
    idKey: 'file-vw-2',
    fileIdKey: 'file-vw-2',
    fileKey: 'file-vw-2',
    knowledgeIdKey: 'private-visual-workbench',
    fileName: '知识库流程梳理.txt',
    fileSize: 4288,
    fileState: 1,
    fileType: 'txt',
    createTime: '2026-05-07 10:30:00',
    updateTime: '2026-05-07 10:30:00',
  },
  {
    idKey: 'file-ai-1',
    fileIdKey: 'file-ai-1',
    fileKey: 'file-ai-1',
    knowledgeIdKey: 'private-ai-demo',
    fileName: 'AI接入方案总览.md',
    fileSize: 13420,
    fileState: 1,
    fileType: 'md',
    createTime: '2026-05-07 10:40:00',
    updateTime: '2026-05-07 10:40:00',
  },
];

export const mockSessions: MockSession[] = [
  {
    idKey: 'session-current',
    sessionIdKey: 'session-current',
    sessionName: '知识库检索说明',
    createTime: '2026-05-08 09:00:00',
    updateTime: '2026-05-08 09:15:00',
  },
];

export const mockSessionRecords: MockSessionRecord[] = [
  {
    idKey: 'record-current-1',
    parentId: 'session-current',
    sessionIdKey: 'session-current',
    sessionName: '知识库检索说明',
    sortNum: 1,
    sessionParam: JSON.stringify({ text: '知识库检索怎么展示引用' }),
    sessionRet: JSON.stringify({
      text: '知识库检索会先返回引用内容，再展示 AI 总结，便于用户核对依据。',
      knowledgeIdKeys: ['private-visual-workbench', 'public-product'],
      knowledgeBases: [
        { id: 'private-visual-workbench', name: '我的知识库-visual-workbench' },
        { id: 'public-product', name: '公共知识库-产品文档' },
      ],
      files: [
        {
          fileKey: 'file-vw-1',
          fileName: 'visual-workbench接入说明.md',
        },
      ],
      searchDocs: [
        {
          fileKey: 'file-vw-1',
          fileName: 'visual-workbench接入说明.md',
          text: 'AI 助手支持知识库选择、引用卡片、历史会话和文件管理。',
          content: '详细内容：检索返回后先展示引用内容，再输出总结文本。引用内容支持展开、复制和下载。',
        },
      ],
    }),
    createTime: '2026-05-08 09:10:00',
    updateTime: '2026-05-08 09:15:00',
  },
];
