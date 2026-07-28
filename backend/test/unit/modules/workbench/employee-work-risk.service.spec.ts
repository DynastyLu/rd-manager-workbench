import {
  EmployeeProgressPeriod,
  EmployeeWorkImportStatus,
  EmployeeWorkKind,
  EmployeeWorkStatus,
  RiskImpact,
  RiskLevel,
  RiskLikelihood,
} from '@prisma/client';
import { EmployeeWorkRiskService } from '../../../../src/modules/workbench/employees/application/employee-work-risk.service';

describe('EmployeeWorkRiskService', () => {
  const workItem = {
    id: 'work-1',
    title: '完成权限模型',
    riskText: '外部权限依赖未就绪',
    status: EmployeeWorkStatus.AT_RISK,
    workKind: EmployeeWorkKind.PROJECT,
    projectId: 'project-1',
    taskId: 'task-1',
    riskId: null,
    employee: { displayName: '张三' },
    project: { id: 'project-1', archivedAt: null },
  };
  const risk = { id: 'risk-1', title: workItem.title };
  const tx = {
    $executeRaw: jest.fn(),
    employeeWorkItem: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    risk: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(),
  };
  const risks = {
    createRiskInTransaction: jest.fn(),
  };
  const audit = {
    record: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((work) => work(tx));
    tx.employeeWorkItem.findFirst
      .mockResolvedValueOnce(workItem)
      .mockResolvedValueOnce({ ...workItem, riskId: risk.id });
    tx.employeeWorkItem.update.mockResolvedValue({ ...workItem, riskId: risk.id });
    tx.risk.findFirst.mockResolvedValue(risk);
    risks.createRiskInTransaction.mockResolvedValue(risk);
    audit.record.mockResolvedValue({});
  });

  const createService = () =>
    new (EmployeeWorkRiskService as unknown as new (
      prisma: unknown,
      risks: unknown,
      audit: unknown,
    ) => EmployeeWorkRiskService)(prisma, risks, audit);

  it('creates one linked project risk and returns it on retry', async () => {
    const service = createService();

    const first = await service.convert('work-1');
    const second = await service.convert('work-1');

    expect(first).toEqual({ risk, alreadyExists: false });
    expect(second).toEqual({ risk, alreadyExists: true });
    expect(risks.createRiskInTransaction).toHaveBeenCalledTimes(1);
    expect(risks.createRiskInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        title: workItem.title,
        description: workItem.riskText,
        likelihood: RiskLikelihood.MEDIUM,
        impact: RiskImpact.MEDIUM,
        level: RiskLevel.MEDIUM,
        ownerName: workItem.employee.displayName,
        projectId: workItem.projectId,
        taskId: workItem.taskId,
      }),
    );
    expect(tx.employeeWorkItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'work-1',
          archivedAt: null,
          employee: { archivedAt: null },
          importBatch: {
            periodType: EmployeeProgressPeriod.WEEK,
            status: EmployeeWorkImportStatus.COMPLETED,
            archivedAt: null,
          },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WORK_RISK_CONVERTED',
        outcome: 'SUCCEEDED',
        metadata: expect.objectContaining({ workItemId: 'work-1', riskId: 'risk-1' }),
      }),
      tx,
    );
  });

  it('creates an idempotent employee risk for non-project work without project references', async () => {
    const nonProject = {
      ...workItem,
      workKind: EmployeeWorkKind.NON_PROJECT,
      projectId: null,
      taskId: null,
      project: null,
    };
    tx.employeeWorkItem.findFirst
      .mockReset()
      .mockResolvedValueOnce(nonProject)
      .mockResolvedValueOnce({ ...nonProject, riskId: risk.id });
    const service = createService();

    await expect(service.convert('work-1')).resolves.toEqual({
      risk,
      alreadyExists: false,
    });
    await expect(service.convert('work-1')).resolves.toEqual({
      risk,
      alreadyExists: true,
    });

    expect(risks.createRiskInTransaction).toHaveBeenCalledTimes(1);
    expect(risks.createRiskInTransaction).toHaveBeenCalledWith(tx, {
      title: workItem.title,
      description: workItem.riskText,
      likelihood: RiskLikelihood.MEDIUM,
      impact: RiskImpact.MEDIUM,
      level: RiskLevel.MEDIUM,
      ownerName: workItem.employee.displayName,
    });
    expect(tx.employeeWorkItem.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ ...workItem, riskText: '  ' }, 'risk text'],
    [{ ...workItem, status: EmployeeWorkStatus.IN_PROGRESS }, 'risk status'],
    [
      { ...workItem, workKind: null, projectId: null, project: null },
      'active project',
    ],
    [{ ...workItem, project: { id: 'project-1', archivedAt: new Date() } }, 'active project'],
  ])('rejects an ineligible current work item (%s)', async (ineligible, message) => {
    tx.employeeWorkItem.findFirst.mockReset().mockResolvedValue(ineligible);
    const service = createService();

    await expect(service.convert('work-1')).rejects.toMatchObject({
      message: expect.stringContaining(message),
    });
    expect(risks.createRiskInTransaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMPLOYEE_WORK_RISK_CONVERSION_FAILED',
        outcome: 'FAILED',
        metadata: expect.objectContaining({ workItemId: 'work-1' }),
      }),
    );
  });
});
