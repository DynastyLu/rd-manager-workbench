import { HttpStatus, Injectable } from '@nestjs/common';
import { RiskStatus, TaskStatus } from '@prisma/client';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { DocumentsService } from '../../content/application/documents.service';
import { RisksService } from '../../management/application/risks.service';
import { TasksService } from '../../tasks/application/tasks.service';
import { SearchAction, SearchHit, SearchType } from '../domain/search.types';

export interface RunSearchActionInput {
  action: SearchAction;
  confirm?: boolean;
}

@Injectable()
export class SearchActionsService {
  constructor(
    private readonly tasks: TasksService,
    private readonly documents: DocumentsService,
    private readonly risks: RisksService,
  ) {}

  async run(type: SearchType, id: string, input: RunSearchActionInput): Promise<SearchHit> {
    if (type === 'TASK' && input.action === 'COMPLETE_TASK') {
      const current = await this.tasks.getTask(id);
      if (
        current.status === TaskStatus.DONE ||
        current.status === TaskStatus.CANCELLED
      ) {
        throw this.unsupported();
      }
      const task = await this.tasks.updateTask(id, { status: TaskStatus.DONE });
      return this.taskHit(task);
    }
    if (type === 'TASK' && input.action === 'REOPEN_TASK') {
      const current = await this.tasks.getTask(id);
      if (current.status !== TaskStatus.DONE) throw this.unsupported();
      const task = await this.tasks.updateTask(id, { status: TaskStatus.TODO });
      return this.taskHit(task);
    }
    if (type === 'DOCUMENT' && input.action === 'TOGGLE_DOCUMENT_FAVORITE') {
      const current = await this.documents.get(id);
      const document = await this.documents.update(id, { isFavorite: !current.isFavorite });
      return this.documentHit(document);
    }
    if (type === 'RISK' && input.action === 'CLOSE_RISK' && input.confirm === true) {
      const current = await this.risks.get(id);
      if (current.status === RiskStatus.CLOSED) throw this.unsupported();
      const risk = await this.risks.update(id, {
        title: current.title,
        likelihood: current.likelihood,
        impact: current.impact,
        level: current.level,
        status: RiskStatus.CLOSED,
        description: current.description ?? undefined,
        mitigation: current.mitigation ?? undefined,
        ownerName: current.ownerName ?? undefined,
        projectId: current.projectId ?? undefined,
        milestoneId: current.milestoneId ?? undefined,
        taskId: current.taskId ?? undefined,
      });
      return this.riskHit(risk);
    }
    throw this.unsupported();
  }

  private unsupported(): AppError {
    return new AppError({
      code: ErrorCodes.SEARCH_ACTION_UNSUPPORTED,
      message: 'Search action is not supported for this result',
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }

  private taskHit(task: Awaited<ReturnType<TasksService['updateTask']>>): SearchHit {
    const snippet = this.snippet(task.description, task.assigneeName);
    return this.hit(
      'TASK',
      task.id,
      task.title,
      snippet,
      `/my-work?taskId=${encodeURIComponent(task.id)}`,
      task.updatedAt,
      [
        'OPEN',
        'COPY_LINK',
        task.status === TaskStatus.DONE ? 'REOPEN_TASK' : 'COMPLETE_TASK',
      ],
    );
  }

  private documentHit(
    document: Awaited<ReturnType<DocumentsService['update']>>,
  ): SearchHit {
    return this.hit(
      'DOCUMENT',
      document.id,
      document.title,
      this.snippet(document.plainText),
      `/docs?documentId=${encodeURIComponent(document.id)}`,
      document.updatedAt,
      ['OPEN', 'COPY_LINK', 'TOGGLE_DOCUMENT_FAVORITE'],
    );
  }

  private riskHit(risk: Awaited<ReturnType<RisksService['update']>>): SearchHit {
    const params = new URLSearchParams({ recordId: risk.id });
    if (risk.projectId) params.set('projectId', risk.projectId);
    return this.hit(
      'RISK',
      risk.id,
      risk.title,
      this.snippet(risk.description, risk.mitigation),
      `/library/governance/risks?${params.toString()}`,
      risk.updatedAt,
      ['OPEN', 'COPY_LINK'],
    );
  }

  private hit(
    type: SearchType,
    id: string,
    title: string,
    snippet: string | null,
    path: string,
    updatedAt: Date,
    actions: SearchAction[],
  ): SearchHit {
    return {
      type,
      id,
      title,
      snippet,
      path,
      updatedAt: updatedAt.toISOString(),
      score: 400,
      matches: [{ field: 'title', start: 0, end: Array.from(title).length }],
      actions,
    };
  }

  private snippet(...values: Array<string | null | undefined>): string | null {
    const value = values.filter((item): item is string => Boolean(item?.trim())).join(' · ');
    return value ? Array.from(value).slice(0, 240).join('') : null;
  }
}
