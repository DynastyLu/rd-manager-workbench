import { RiskStatus, TaskStatus } from '@prisma/client';
import { SearchActionsService } from '../../../../src/modules/workbench/search/application/search-actions.service';

describe('SearchActionsService', () => {
  const tasks = {
    getTask: jest.fn(),
    updateTask: jest.fn(),
  };
  const documents = {
    get: jest.fn(),
    update: jest.fn(),
  };
  const risks = {
    get: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('completes and reopens tasks through TasksService rules', async () => {
    tasks.getTask.mockResolvedValue({
      id: 'task-1',
      title: '研发计划',
      description: '任务说明',
      status: TaskStatus.TODO,
      updatedAt: new Date('2026-07-20T00:00:00.000Z'),
    });
    tasks.updateTask.mockResolvedValue({
      id: 'task-1',
      title: '研发计划',
      description: '任务说明',
      status: TaskStatus.DONE,
      updatedAt: new Date('2026-07-20T01:00:00.000Z'),
    });
    const service = new SearchActionsService(tasks as never, documents as never, risks as never);

    const result = await service.run('TASK', 'task-1', { action: 'COMPLETE_TASK' });

    expect(tasks.updateTask).toHaveBeenCalledWith('task-1', { status: TaskStatus.DONE });
    expect(result).toEqual(
      expect.objectContaining({
        type: 'TASK',
        id: 'task-1',
        path: '/my-work?taskId=task-1',
        actions: ['OPEN', 'COPY_LINK', 'REOPEN_TASK'],
      }),
    );
  });

  it('toggles a document favorite through DocumentsService', async () => {
    documents.get.mockResolvedValue({
      id: 'doc-1',
      title: '研发计划',
      plainText: '正文',
      isFavorite: false,
      updatedAt: new Date('2026-07-20T00:00:00.000Z'),
    });
    documents.update.mockResolvedValue({
      id: 'doc-1',
      title: '研发计划',
      plainText: '正文',
      isFavorite: true,
      updatedAt: new Date('2026-07-20T01:00:00.000Z'),
    });
    const service = new SearchActionsService(tasks as never, documents as never, risks as never);

    await service.run('DOCUMENT', 'doc-1', { action: 'TOGGLE_DOCUMENT_FAVORITE' });

    expect(documents.update).toHaveBeenCalledWith('doc-1', { isFavorite: true });
  });

  it('requires explicit confirmation before closing a risk', async () => {
    const service = new SearchActionsService(tasks as never, documents as never, risks as never);

    await expect(service.run('RISK', 'risk-1', { action: 'CLOSE_RISK' })).rejects.toMatchObject({
      code: 'SEARCH_ACTION_UNSUPPORTED',
    });
    expect(risks.update).not.toHaveBeenCalled();
  });

  it('closes a confirmed risk while preserving required domain fields', async () => {
    risks.get.mockResolvedValue({
      id: 'risk-1',
      title: '供应风险',
      description: '说明',
      likelihood: 'HIGH',
      impact: 'HIGH',
      level: 'HIGH',
      status: RiskStatus.OPEN,
      updatedAt: new Date('2026-07-20T00:00:00.000Z'),
    });
    risks.update.mockResolvedValue({
      id: 'risk-1',
      title: '供应风险',
      description: '说明',
      likelihood: 'HIGH',
      impact: 'HIGH',
      level: 'HIGH',
      status: RiskStatus.CLOSED,
      updatedAt: new Date('2026-07-20T01:00:00.000Z'),
    });
    const service = new SearchActionsService(tasks as never, documents as never, risks as never);

    const result = await service.run('RISK', 'risk-1', {
      action: 'CLOSE_RISK',
      confirm: true,
    });

    expect(risks.update).toHaveBeenCalledWith(
      'risk-1',
      expect.objectContaining({ status: RiskStatus.CLOSED, title: '供应风险', level: 'HIGH' }),
    );
    expect(result.actions).toEqual(['OPEN', 'COPY_LINK']);
  });

  it('rejects actions outside the type allowlist', async () => {
    const service = new SearchActionsService(tasks as never, documents as never, risks as never);
    await expect(
      service.run('PARTNER', 'partner-1', { action: 'COMPLETE_TASK' }),
    ).rejects.toMatchObject({ code: 'SEARCH_ACTION_UNSUPPORTED' });
  });

  it.each([
    ['COMPLETE_TASK', TaskStatus.DONE],
    ['COMPLETE_TASK', TaskStatus.CANCELLED],
    ['REOPEN_TASK', TaskStatus.TODO],
  ] as const)('rejects %s for a task in %s', async (action, status) => {
    tasks.getTask.mockResolvedValue({ id: 'task-1', status });
    const service = new SearchActionsService(tasks as never, documents as never, risks as never);

    await expect(service.run('TASK', 'task-1', { action })).rejects.toMatchObject({
      code: 'SEARCH_ACTION_UNSUPPORTED',
    });
    expect(tasks.updateTask).not.toHaveBeenCalled();
  });

  it('rejects closing a risk that is already closed', async () => {
    risks.get.mockResolvedValue({ id: 'risk-1', status: RiskStatus.CLOSED });
    const service = new SearchActionsService(tasks as never, documents as never, risks as never);

    await expect(
      service.run('RISK', 'risk-1', { action: 'CLOSE_RISK', confirm: true }),
    ).rejects.toMatchObject({ code: 'SEARCH_ACTION_UNSUPPORTED' });
    expect(risks.update).not.toHaveBeenCalled();
  });
});
