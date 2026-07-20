import { createHash, randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ExtensionProfile, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { ExtensionsGateway } from '../extensions.gateway';
import { ExtensionsService } from './extensions.service';
import {
  AuthoritativePreflight,
  ExternalSyncCompletionService,
} from './external-sync-completion.service';

const calendarTargetSchema = z.object({
  type: z.literal('CALENDAR'),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
}).strict();

const fileTargetSchema = z.object({
  type: z.literal('FILE'),
  fileAssetId: z.string().min(1).max(200),
  remotePath: z.string().min(1).max(1000),
  mode: z.enum(['UPLOAD', 'DOWNLOAD']),
}).strict();

export const syncTargetSchema = z.discriminatedUnion('type', [calendarTargetSchema, fileTargetSchema]);
export type SyncTarget = z.infer<typeof syncTargetSchema>;

const resolutionSchema = z.object({
  itemKey: z.string().min(1).max(1000),
  resolution: z.enum(['KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY']),
}).strict();

export type SyncResolution = z.infer<typeof resolutionSchema>;

export function normalizeExternalPath(path: string) {
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { throw externalPathError(); }
  if (!decoded || decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) throw externalPathError();
  const normalized = posix.normalize(decoded);
  if (normalized === '..' || normalized.startsWith('../') || normalized !== decoded) throw externalPathError();
  return normalized;
}

export function sameOrigin(requestUrl: string, redirectUrl: string) {
  try { return new URL(requestUrl).origin === new URL(redirectUrl).origin; } catch { return false; }
}

function externalPathError() {
  return new AppError({ code: ErrorCodes.EXTERNAL_PATH_INVALID, message: 'External path is invalid', statusCode: HttpStatus.BAD_REQUEST });
}

@Injectable()
export class ExternalSyncService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly extensions: ExtensionsService,
    private readonly gateway: ExtensionsGateway,
    private readonly storage: StoragePort,
    private readonly completion: ExternalSyncCompletionService,
  ) {}

  async prepare(input: { profileId: string; target: unknown }) {
    const target = this.parseTarget(input.target);
    const profile = await this.requireProfile(input.profileId, target);
    const sessionId = randomUUID();
    const { operation, payload, summary } = await this.buildPreflightPayload(profile, target, sessionId);
    const prepared = await this.extensions.prepareRun(profile.id, { operation, payload });
    await this.prisma.externalSyncSession.create({
      data: {
        id: sessionId,
        profileId: profile.id,
        targetType: target.type,
        request: target as Prisma.InputJsonValue,
        status: 'DRAFT',
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    return { sessionId, ...prepared, summary };
  }

  async startPreflight(sessionId: string, confirmationHash: string) {
    const session = await this.requireSession(sessionId, 'DRAFT');
    this.assertNotExpired(session.expiresAt);
    const target = this.parseTarget(session.request);
    const profile = await this.requireProfile(session.profileId, target);
    const { operation, payload } = await this.buildPreflightPayload(profile, target, session.id);
    await this.claimSession(session.id, 'DRAFT', 'PREFLIGHT_STARTING');
    try {
      const started = await this.extensions.startRun(profile.id, { operation, payload, confirmationHash });
      if (!('completionToken' in started) || typeof started.completionToken !== 'string') {
        throw this.invalid('External provider run did not start');
      }
      await this.prisma.externalSyncSession.update({
        where: { id: session.id },
        data: { status: 'PREFLIGHT_RUNNING', preflightRunId: started.id, errorCode: null },
      });
      this.publish(profile, started, operation, payload);
      return { sessionId: session.id, runId: started.id, status: 'PREFLIGHT_RUNNING' };
    } catch (error) {
      await this.prisma.externalSyncSession.updateMany({
        where: { id: session.id, status: 'PREFLIGHT_STARTING' },
        data: { status: 'DRAFT', errorCode: null },
      });
      throw error;
    }
  }

  async getSession(id: string) {
    const session = await this.requireSession(id);
    return {
      id: session.id,
      profileId: session.profileId,
      targetType: session.targetType,
      status: session.status,
      preflightRunId: session.preflightRunId,
      commitRunId: session.commitRunId,
      preflight: session.preflight,
      errorCode: session.errorCode,
      committedAt: session.committedAt,
      updatedAt: session.updatedAt,
    };
  }

  async commit(sessionId: string, input: { preflightHash: string; resolutions: unknown[] }) {
    const session = await this.requireSession(sessionId, 'READY');
    this.assertNotExpired(session.expiresAt);
    const preflight = this.parsePreflight(session.preflight);
    if (session.preflightHash !== input.preflightHash || preflight.preflightHash !== input.preflightHash) {
      throw this.invalid('External sync preflight hash is invalid');
    }
    const parsed = z.array(resolutionSchema).max(500).safeParse(input.resolutions);
    if (!parsed.success) throw this.invalid('External sync resolutions are invalid', parsed.error.flatten());
    const byKey = new Map(parsed.data.map((item) => [item.itemKey, item.resolution]));
    if (byKey.size !== preflight.items.length) throw this.conflict('Every preflight item requires one explicit resolution');
    for (const item of preflight.items) {
      const resolution = byKey.get(item.itemKey);
      if (!resolution || !item.allowedResolutions.includes(resolution)) throw this.conflict('External sync resolution is not allowed');
      await this.assertLocalUnchanged(item);
    }
    await this.claimSession(session.id, 'READY', 'COMMIT_STARTING');
    try {
      const target = this.parseTarget(session.request);
      if (target.type === 'CALENDAR' && !parsed.data.some((item) => item.resolution === 'KEEP_LOCAL')) {
        return await this.completion.commitCalendarLocally(session, preflight, parsed.data);
      }
      const profile = await this.requireProfile(session.profileId, target);
      const { operation, payload } = await this.buildCommitPayload(profile, target, session.id, preflight, parsed.data);
      const prepared = await this.extensions.prepareRun(profile.id, { operation, payload });
      const started = await this.extensions.startRun(profile.id, { operation, payload, confirmationHash: prepared.confirmationHash });
      if (!('completionToken' in started) || typeof started.completionToken !== 'string') throw this.invalid('External provider commit did not start');
      await this.prisma.externalSyncSession.update({
        where: { id: session.id },
        data: {
          status: 'COMMIT_RUNNING', commitRunId: started.id,
          resolutions: parsed.data as Prisma.InputJsonValue, errorCode: null,
        },
      });
      this.publish(profile, started, operation, payload);
      return { sessionId: session.id, runId: started.id, status: 'COMMIT_RUNNING' };
    } catch (error) {
      await this.prisma.externalSyncSession.updateMany({
        where: { id: session.id, status: 'COMMIT_STARTING' },
        data: { status: 'READY', errorCode: null },
      });
      throw error;
    }
  }

  private async claimSession(id: string, expectedStatus: string, claimedStatus: string) {
    const claim = await this.prisma.externalSyncSession.updateMany({
      where: { id, status: expectedStatus },
      data: { status: claimedStatus, errorCode: null },
    });
    if (!claim.count) throw this.conflict('External sync session is already being processed');
  }

  private async buildPreflightPayload(profile: ExtensionProfile, target: SyncTarget, sessionId: string) {
    if (target.type === 'CALENDAR') {
      this.assertCalendarRange(target.startAt, target.endAt);
      return {
        operation: 'CALENDAR_SYNC_PREFLIGHT',
        payload: { syncSessionId: sessionId, startAt: target.startAt, endAt: target.endAt },
        summary: { type: target.type, startAt: target.startAt, endAt: target.endAt },
      };
    }
    const remotePath = normalizeExternalPath(target.remotePath);
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id: target.fileAssetId, status: 'ACTIVE' },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const version = asset?.versions[0];
    if (!asset || !version) throw this.notFound(ErrorCodes.FILE_NOT_FOUND, 'File asset not found');
    const link = await this.prisma.externalObjectLink.findUnique({
      where: { profileId_localType_localId: { profileId: profile.id, localType: 'FILE_ASSET', localId: asset.id } },
    });
    return {
      operation: target.mode === 'UPLOAD' ? 'CLOUD_UPLOAD_PREFLIGHT' : 'CLOUD_DOWNLOAD_PREFLIGHT',
      payload: {
        syncSessionId: sessionId, localType: 'FILE_ASSET', localId: asset.id,
        remotePath, localHash: version.sha256, ...(link?.remoteVersion ? { remoteVersion: link.remoteVersion } : {}),
      },
      summary: { type: target.type, fileAssetId: asset.id, remotePath, mode: target.mode, localHash: version.sha256 },
    };
  }

  private async buildCommitPayload(
    profile: ExtensionProfile,
    target: SyncTarget,
    sessionId: string,
    preflight: AuthoritativePreflight,
    resolutions: SyncResolution[],
  ) {
    const byKey = new Map(resolutions.map((item) => [item.itemKey, item.resolution]));
    if (target.type === 'CALENDAR') {
      const items: Array<{
        localType: 'CALENDAR_EVENT'; localId: string; remoteId: string;
        remoteVersion?: string; ical: string;
      }> = [];
      for (const item of preflight.items.filter((candidate) => byKey.get(candidate.itemKey) === 'KEEP_LOCAL')) {
        if (!item.localId) throw this.conflict('KEEP_LOCAL requires an existing calendar event');
        const event = await this.prisma.calendarEvent.findFirst({ where: { id: item.localId, archivedAt: null } });
        if (!event) throw this.notFound(ErrorCodes.CALENDAR_EVENT_NOT_FOUND, 'Calendar event not found');
        items.push({
          localType: 'CALENDAR_EVENT', localId: event.id, remoteId: item.remoteId,
          remoteVersion: item.remoteVersion, ical: this.calendarIcal(event, String(item.remoteId)),
        });
      }
      return { operation: 'CALENDAR_SYNC_COMMIT', payload: { syncSessionId: sessionId, items } };
    }
    const item = preflight.items[0];
    const resolution = byKey.get(item.itemKey);
    if (!item || !resolution) throw this.invalid('File preflight is empty');
    if (resolution === 'KEEP_LOCAL') {
      const asset = await this.prisma.fileAsset.findFirst({
        where: { id: target.fileAssetId, status: 'ACTIVE' },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      });
      const version = asset?.versions[0];
      if (!version) throw this.notFound(ErrorCodes.FILE_VERSION_NOT_FOUND, 'File version not found');
      if (version.sha256 !== item.localHash) throw this.conflict('File changed after preflight');
      const stored = await this.storage.read(version.storageKey);
      const digest = createHash('sha256').update(stored.content).digest('hex');
      if (digest !== version.sha256) throw new AppError({ code: ErrorCodes.FILE_INTEGRITY_FAILED, message: 'Stored file failed SHA-256 verification', statusCode: HttpStatus.CONFLICT });
      if (stored.content.byteLength > 750 * 1024) throw this.invalid('WebDAV JSON bridge currently supports files up to 750 KiB');
      return {
        operation: 'CLOUD_UPLOAD_COMMIT',
        payload: {
          syncSessionId: sessionId, localType: 'FILE_ASSET', localId: asset.id,
          remotePath: target.remotePath, contentBase64: stored.content.toString('base64'), sha256: digest,
          ...(item.remoteVersion ? { remoteVersion: item.remoteVersion } : {}),
        },
      };
    }
    return {
      operation: 'CLOUD_DOWNLOAD_COMMIT',
      payload: {
        syncSessionId: sessionId, localType: 'FILE_ASSET', localId: target.fileAssetId,
        remotePath: target.remotePath,
        ...(item.remoteHash ? { expectedHash: item.remoteHash } : {}),
        ...(item.remoteVersion ? { expectedVersion: item.remoteVersion } : {}),
      },
    };
  }

  private calendarIcal(event: { id: string; title: string; startAt: Date; endAt: Date; location: string | null; notes: string | null }, remoteId: string) {
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const date = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RD Workbench//EN', 'BEGIN:VEVENT',
      `UID:${escape(remoteId || event.id)}`, `DTSTART:${date(event.startAt)}`, `DTEND:${date(event.endAt)}`,
      `SUMMARY:${escape(event.title)}`, ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
      ...(event.notes ? [`DESCRIPTION:${escape(event.notes)}`] : []), 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  }

  private publish(profile: ExtensionProfile, started: Record<string, unknown>, operation: string, payload: Record<string, unknown>) {
    this.gateway.publishRunRequested({
      runId: String(started.id),
      profile: {
        id: profile.id, kind: profile.kind, provider: profile.provider, enabled: profile.enabled,
        publicConfig: profile.publicConfig, credentialRef: profile.credentialRef, permissions: profile.permissions,
      },
      operation,
      inputSha256: String(started.inputSha256),
      completionToken: String(started.completionToken),
      payload,
    });
  }

  private async assertLocalUnchanged(item: AuthoritativePreflight['items'][number]) {
    if (!item.localId || !item.localHash) return;
    if (item.localType === 'CALENDAR_EVENT') {
      const event = await this.prisma.calendarEvent.findFirst({ where: { id: item.localId, archivedAt: null } });
      if (!event || this.completion.calendarEventHash(event) !== item.localHash) throw this.conflict('Calendar event changed after preflight');
    } else if (item.localType === 'FILE_ASSET') {
      const version = await this.prisma.fileVersion.findFirst({ where: { fileAssetId: item.localId }, orderBy: { versionNumber: 'desc' } });
      if (!version || version.sha256 !== item.localHash) throw this.conflict('File changed after preflight');
    }
  }

  private parseTarget(value: unknown) {
    const parsed = syncTargetSchema.safeParse(value);
    if (!parsed.success) throw this.invalid('External sync target is invalid', parsed.error.flatten());
    if (parsed.data.type === 'FILE') parsed.data.remotePath = normalizeExternalPath(parsed.data.remotePath);
    return parsed.data;
  }

  private parsePreflight(value: Prisma.JsonValue | null): AuthoritativePreflight {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw this.invalid('External sync preflight is unavailable');
    const result = value as unknown as AuthoritativePreflight;
    if (!Array.isArray(result.items) || typeof result.preflightHash !== 'string' || typeof result.expiresAt !== 'string') throw this.invalid('External sync preflight is invalid');
    return result;
  }

  private async requireProfile(id: string, target: SyncTarget) {
    const profile = await this.prisma.extensionProfile.findFirst({ where: { id, enabled: true, archivedAt: null } });
    if (!profile || (target.type === 'CALENDAR' ? profile.provider !== 'CALDAV' : profile.provider !== 'WEBDAV')) {
      throw this.notFound(ErrorCodes.EXTENSION_PROFILE_NOT_FOUND, 'External sync profile not found');
    }
    return profile;
  }

  private async requireSession(id: string, status?: string) {
    const session = await this.prisma.externalSyncSession.findFirst({ where: { id, ...(status ? { status } : {}) } });
    if (!session) throw this.notFound(ErrorCodes.EXTERNAL_SYNC_NOT_FOUND, 'External sync session not found or not in the required state');
    return session;
  }

  private assertCalendarRange(start: string, end: string) {
    const duration = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 366 * 24 * 60 * 60_000) throw this.invalid('Calendar sync range is invalid');
  }

  private assertNotExpired(value: Date | null) {
    if (!value || value.getTime() <= Date.now()) throw this.invalid('External sync session has expired');
  }

  private invalid(message: string, details?: unknown) {
    return new AppError({ code: ErrorCodes.EXTENSION_CONFIG_INVALID, message, statusCode: HttpStatus.BAD_REQUEST, details });
  }

  private conflict(message: string) {
    return new AppError({ code: ErrorCodes.EXTERNAL_SYNC_CONFLICT, message, statusCode: HttpStatus.CONFLICT });
  }

  private notFound(code: typeof ErrorCodes.FILE_NOT_FOUND | typeof ErrorCodes.FILE_VERSION_NOT_FOUND | typeof ErrorCodes.CALENDAR_EVENT_NOT_FOUND | typeof ErrorCodes.EXTENSION_PROFILE_NOT_FOUND | typeof ErrorCodes.EXTERNAL_SYNC_NOT_FOUND, message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND });
  }
}
