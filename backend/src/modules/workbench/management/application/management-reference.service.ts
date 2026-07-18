import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';

@Injectable()
export class ManagementReferenceService {
  async assertReference(tx: Prisma.TransactionClient, input: { projectId?: string; milestoneId?: string; taskId?: string }) {
    if (input.projectId) {
      const project = await tx.project.findFirst({ where: { id: input.projectId, archivedAt: null }, select: { id: true } });
      if (!project) throw this.notFound(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found');
    }
    if (input.milestoneId) {
      const milestone = await tx.milestone.findFirst({ where: { id: input.milestoneId }, select: { projectId: true } });
      if (!milestone || (input.projectId && milestone.projectId !== input.projectId)) throw this.invalid('Milestone reference is invalid');
    }
    if (input.taskId) {
      const task = await tx.workTask.findFirst({ where: { id: input.taskId, archivedAt: null }, select: { projectId: true } });
      if (!task || (input.projectId && task.projectId !== input.projectId)) throw this.invalid('Task reference is invalid');
    }
  }
  async assertActiveMeeting(tx: Prisma.TransactionClient, meetingId: string) {
    const meeting = await tx.meeting.findFirst({ where: { id: meetingId, archivedAt: null }, select: { id: true } });
    if (!meeting) throw this.notFound(ErrorCodes.MEETING_NOT_FOUND, 'Meeting not found');
  }
  private invalid(message: string) { return new AppError({ code: ErrorCodes.MANAGEMENT_REFERENCE_INVALID, message, statusCode: HttpStatus.UNPROCESSABLE_ENTITY }); }
  private notFound(code: (typeof ErrorCodes)[keyof typeof ErrorCodes], message: string) { return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND }); }
}
