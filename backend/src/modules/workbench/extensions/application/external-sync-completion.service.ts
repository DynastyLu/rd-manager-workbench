import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ExternalConflictState,
  ExternalSyncDirection,
  ExtensionRun,
  Prisma,
} from '@prisma/client';
import { z } from 'zod';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { StoragePort } from '../../../../infrastructure/storage/storage.port';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { CompleteExtensionRunDto } from '../interface/http/dto/extensions.dto';
import { canonicalHash, ExternalSyncResolution } from '../domain/external-sync';

type SyncResolution = { itemKey: string; resolution: ExternalSyncResolution };

type Tx = Prisma.TransactionClient;

export interface PreparedExternalCompletion {
  apply(tx: Tx): Promise<void>;
  rollback(): Promise<void>;
}

const calendarProviderOutputSchema = z.object({
  items: z.array(z.object({
    remoteId: z.string().min(1).max(1000),
    remoteVersion: z.string().max(500).optional(),
    ical: z.string().min(1).max(1024 * 1024),
  }).strict()).max(500),
}).strict();

const calendarCommitOutputSchema = z.object({
  items: z.array(z.object({
    remoteId: z.string().min(1).max(1000),
    remoteVersion: z.string().max(500).optional(),
  }).strict()).max(500),
}).strict();

const webDavPreflightOutputSchema = z.object({
  action: z.enum(['ADD', 'UPDATE', 'CONFLICT']),
  remotePath: z.string().min(1).max(1000),
  remoteVersion: z.string().max(500).optional(),
  remoteHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
}).strict();

const webDavUploadOutputSchema = z.object({
  remotePath: z.string().min(1).max(1000),
  remoteVersion: z.string().max(500).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const webDavDownloadOutputSchema = webDavUploadOutputSchema.extend({
  contentBase64: z.string().min(1).max(1_050_000),
}).strict();

interface CalendarPreview {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  link: string | null;
  notes: string | null;
}

export interface AuthoritativeItem {
  itemKey: string;
  localType: 'CALENDAR_EVENT' | 'FILE_ASSET';
  localId?: string;
  remoteId: string;
  remoteVersion?: string;
  localHash?: string;
  remoteHash?: string;
  action: 'ADD' | 'UPDATE' | 'CONFLICT';
  allowedResolutions: Array<SyncResolution['resolution']>;
  remotePreview?: CalendarPreview;
}

export interface AuthoritativePreflight {
  sessionId: string;
  profileId: string;
  provider: string;
  targetType: 'CALENDAR' | 'FILE';
  direction: ExternalSyncDirection;
  items: AuthoritativeItem[];
  expiresAt: string;
  preflightHash: string;
}

@Injectable()
export class ExternalSyncCompletionService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly storage: StoragePort,
  ) {}

  async prepare(run: ExtensionRun, dto: CompleteExtensionRunDto): Promise<PreparedExternalCompletion | null> {
    if (!run.operation.includes('_SYNC_') && !run.operation.startsWith('CLOUD_')) return null;
    const session = await this.prisma.externalSyncSession.findFirst({
      where: { OR: [{ preflightRunId: run.id }, { commitRunId: run.id }] },
      include: { profile: true },
    });
    if (!session) throw this.invalid('External sync run is not attached to a session');
    if (dto.status !== 'SUCCEEDED') {
      return {
        apply: async (tx) => { await tx.externalSyncSession.update({ where: { id: session.id }, data: { status: 'FAILED', errorCode: dto.errorCode ?? 'PROVIDER_REJECTED' } }); },
        rollback: async () => undefined,
      };
    }
    if (run.id === session.preflightRunId) return this.preparePreflightCompletion(session, dto.output);
    if (run.id === session.commitRunId) return this.prepareCommitCompletion(session, dto.output);
    throw this.invalid('External sync run does not match the session state');
  }

  calendarEventHash(event: {
    title: string; startAt: Date | string; endAt: Date | string; allDay: boolean;
    location: string | null; link: string | null; notes: string | null;
  }) {
    return canonicalHash({
      title: event.title,
      startAt: new Date(event.startAt).toISOString(),
      endAt: new Date(event.endAt).toISOString(),
      allDay: event.allDay,
      location: event.location,
      link: event.link,
      notes: event.notes,
    });
  }

  async commitCalendarLocally(
    session: { id: string; profileId: string },
    preflight: AuthoritativePreflight,
    resolutions: SyncResolution[],
  ) {
    const byKey = new Map(resolutions.map((item) => [item.itemKey, item.resolution]));
    await this.prisma.$transaction(async (tx) => {
      await this.applyCalendarDecisions(tx, session.profileId, preflight, byKey, new Map());
      await tx.externalSyncSession.update({
        where: { id: session.id },
        data: {
          status: 'COMMITTED', resolutions: resolutions as Prisma.InputJsonValue,
          committedAt: new Date(), errorCode: null,
        },
      });
    });
    return { sessionId: session.id, status: 'COMMITTED', committed: preflight.items.length };
  }

  private async preparePreflightCompletion(
    session: Awaited<ReturnType<ExternalSyncCompletionService['requireSessionShape']>>,
    output: unknown,
  ): Promise<PreparedExternalCompletion> {
    const request = session.request as Record<string, unknown>;
    const preflight = session.targetType === 'CALENDAR'
      ? await this.buildCalendarPreflight(session, output)
      : await this.buildFilePreflight(session, request, output);
    return {
      apply: async (tx) => {
        await tx.externalSyncSession.update({
          where: { id: session.id },
          data: {
            status: 'READY', preflight: preflight as unknown as Prisma.InputJsonValue,
            preflightHash: preflight.preflightHash, expiresAt: new Date(preflight.expiresAt), errorCode: null,
          },
        });
      },
      rollback: async () => undefined,
    };
  }

  private async prepareCommitCompletion(
    session: Awaited<ReturnType<ExternalSyncCompletionService['requireSessionShape']>>,
    output: unknown,
  ): Promise<PreparedExternalCompletion> {
    const preflight = this.parseStoredPreflight(session.preflight);
    const resolutions = this.parseStoredResolutions(session.resolutions);
    const byKey = new Map(resolutions.map((item) => [item.itemKey, item.resolution]));
    if (session.targetType === 'CALENDAR') {
      const parsed = calendarCommitOutputSchema.safeParse(output);
      if (!parsed.success) throw this.outputInvalid(parsed.error.flatten());
      const versions = new Map(parsed.data.items.map((item) => [item.remoteId, item.remoteVersion]));
      for (const item of preflight.items.filter((candidate) => byKey.get(candidate.itemKey) === 'KEEP_LOCAL')) {
        if (!versions.has(item.remoteId)) throw this.outputInvalid('Calendar provider omitted a committed item');
      }
      return {
        apply: async (tx) => {
          await this.applyCalendarDecisions(tx, session.profileId, preflight, byKey, versions);
          await tx.externalSyncSession.update({ where: { id: session.id }, data: { status: 'COMMITTED', committedAt: new Date(), errorCode: null } });
        },
        rollback: async () => undefined,
      };
    }
    const resolution = resolutions[0]?.resolution;
    if (resolution === 'KEEP_LOCAL') return this.prepareFileUploadCompletion(session, preflight, output);
    return this.prepareFileDownloadCompletion(session, preflight, resolution, output);
  }

  private async buildCalendarPreflight(
    session: Awaited<ReturnType<ExternalSyncCompletionService['requireSessionShape']>>,
    output: unknown,
  ): Promise<AuthoritativePreflight> {
    const parsed = calendarProviderOutputSchema.safeParse(output);
    if (!parsed.success) throw this.outputInvalid(parsed.error.flatten());
    const config = session.profile.publicConfig as Record<string, unknown>;
    const collection = this.calendarCollection(config);
    const direction = config.syncDirection === 'BIDIRECTIONAL' ? ExternalSyncDirection.BIDIRECTIONAL : ExternalSyncDirection.PULL_ONLY;
    const remoteIds = parsed.data.items.map((item) => this.assertCalendarRemoteId(collection, item.remoteId));
    if (new Set(remoteIds).size !== remoteIds.length) throw this.outputInvalid('Calendar provider returned duplicate remote ids');
    const links = await this.prisma.externalObjectLink.findMany({ where: { profileId: session.profileId, remoteId: { in: remoteIds } } });
    const linkByRemote = new Map(links.map((link) => [link.remoteId, link]));
    const localIds = links.map((link) => link.localId);
    const events = await this.prisma.calendarEvent.findMany({ where: { id: { in: localIds }, archivedAt: null } });
    const eventById = new Map(events.map((event) => [event.id, event]));
    const items: AuthoritativeItem[] = parsed.data.items.map((remote, index) => {
      const remoteId = remoteIds[index]!;
      const preview = this.parseIcal(remote.ical);
      const remoteHash = this.calendarEventHash(preview);
      const link = linkByRemote.get(remoteId);
      const local = link ? eventById.get(link.localId) : undefined;
      const localHash = local ? this.calendarEventHash(local) : undefined;
      const localChanged = Boolean(link?.syncHash && localHash && link.syncHash !== localHash);
      const remoteChanged = Boolean(link && (link.syncHash !== remoteHash || link.remoteVersion !== remote.remoteVersion));
      const action = !link ? 'ADD' : localChanged && remoteChanged ? 'CONFLICT' : 'UPDATE';
      const allowedResolutions: AuthoritativeItem['allowedResolutions'] = !link
        ? ['KEEP_REMOTE']
        : direction === ExternalSyncDirection.BIDIRECTIONAL
          ? ['KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY']
          : ['KEEP_REMOTE', 'CREATE_COPY'];
      return {
        itemKey: remoteId, localType: 'CALENDAR_EVENT', ...(local ? { localId: local.id, localHash } : {}),
        remoteId, ...(remote.remoteVersion ? { remoteVersion: remote.remoteVersion } : {}), remoteHash,
        action, allowedResolutions, remotePreview: preview,
      };
    });
    return this.signPreflight(session, direction, items);
  }

  private async buildFilePreflight(
    session: Awaited<ReturnType<ExternalSyncCompletionService['requireSessionShape']>>,
    request: Record<string, unknown>,
    output: unknown,
  ): Promise<AuthoritativePreflight> {
    const parsed = webDavPreflightOutputSchema.safeParse(output);
    if (!parsed.success) throw this.outputInvalid(parsed.error.flatten());
    if (parsed.data.remotePath !== request.remotePath) throw this.outputInvalid('WebDAV provider returned a different remote path');
    const fileAssetId = String(request.fileAssetId ?? '');
    const version = await this.prisma.fileVersion.findFirst({ where: { fileAssetId }, orderBy: { versionNumber: 'desc' } });
    if (!version) throw this.outputInvalid('Local file version no longer exists');
    const link = await this.prisma.externalObjectLink.findUnique({
      where: { profileId_localType_localId: { profileId: session.profileId, localType: 'FILE_ASSET', localId: fileAssetId } },
    });
    const remoteExists = parsed.data.action !== 'ADD';
    const localChanged = Boolean(link?.syncHash && link.syncHash !== version.sha256);
    const remoteChanged = Boolean(link && remoteExists && (link.remoteVersion !== parsed.data.remoteVersion || (parsed.data.remoteHash && link.syncHash !== parsed.data.remoteHash)));
    const action = !remoteExists ? 'ADD' : localChanged && remoteChanged ? 'CONFLICT' : 'UPDATE';
    const mode = request.mode;
    const allowedResolutions: AuthoritativeItem['allowedResolutions'] = !remoteExists
      ? mode === 'UPLOAD' ? ['KEEP_LOCAL'] : []
      : action === 'CONFLICT' ? ['KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY']
        : mode === 'UPLOAD' ? ['KEEP_LOCAL'] : ['KEEP_REMOTE', 'CREATE_COPY'];
    if (!allowedResolutions.length) throw this.outputInvalid('The requested remote file does not exist');
    return this.signPreflight(session, ExternalSyncDirection.BIDIRECTIONAL, [{
      itemKey: fileAssetId, localType: 'FILE_ASSET', localId: fileAssetId,
      localHash: version.sha256, remoteId: parsed.data.remotePath,
      ...(parsed.data.remoteVersion ? { remoteVersion: parsed.data.remoteVersion } : {}),
      ...(parsed.data.remoteHash ? { remoteHash: parsed.data.remoteHash } : {}),
      action, allowedResolutions,
    }]);
  }

  private signPreflight(
    session: { id: string; profileId: string; targetType: string; profile: { provider: string } },
    direction: ExternalSyncDirection,
    items: AuthoritativeItem[],
  ): AuthoritativePreflight {
    const base = {
      sessionId: session.id, profileId: session.profileId, provider: session.profile.provider,
      targetType: session.targetType as 'CALENDAR' | 'FILE', direction, items,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    return { ...base, preflightHash: canonicalHash(base) };
  }

  private async prepareFileUploadCompletion(
    session: Awaited<ReturnType<ExternalSyncCompletionService['requireSessionShape']>>,
    preflight: AuthoritativePreflight,
    output: unknown,
  ): Promise<PreparedExternalCompletion> {
    const parsed = webDavUploadOutputSchema.safeParse(output);
    if (!parsed.success) throw this.outputInvalid(parsed.error.flatten());
    const item = preflight.items[0]!;
    if (parsed.data.remotePath !== item.remoteId || parsed.data.sha256 !== item.localHash) throw this.outputInvalid('WebDAV upload result does not match the authoritative file');
    return {
      apply: async (tx) => {
        await this.upsertLink(tx, session.profileId, item, item.localId!, parsed.data.remoteVersion, parsed.data.sha256, ExternalSyncDirection.BIDIRECTIONAL, 'KEEP_LOCAL');
        await tx.externalSyncSession.update({ where: { id: session.id }, data: { status: 'COMMITTED', committedAt: new Date(), errorCode: null } });
      },
      rollback: async () => undefined,
    };
  }

  private async prepareFileDownloadCompletion(
    session: Awaited<ReturnType<ExternalSyncCompletionService['requireSessionShape']>>,
    preflight: AuthoritativePreflight,
    resolution: SyncResolution['resolution'] | undefined,
    output: unknown,
  ): Promise<PreparedExternalCompletion> {
    if (resolution !== 'KEEP_REMOTE' && resolution !== 'CREATE_COPY') throw this.outputInvalid('File download resolution is invalid');
    const parsed = webDavDownloadOutputSchema.safeParse(output);
    if (!parsed.success) throw this.outputInvalid(parsed.error.flatten());
    const item = preflight.items[0]!;
    if (parsed.data.remotePath !== item.remoteId) throw this.outputInvalid('WebDAV download path does not match preflight');
    if (item.remoteVersion && parsed.data.remoteVersion !== item.remoteVersion) {
      throw this.outputInvalid('WebDAV file changed after preflight');
    }
    const bytes = Buffer.from(parsed.data.contentBase64, 'base64');
    if (bytes.byteLength > 750 * 1024 || bytes.toString('base64') !== parsed.data.contentBase64.replace(/\s/g, '')) throw this.outputInvalid('WebDAV download body is invalid or too large');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== parsed.data.sha256 || (item.remoteHash && item.remoteHash !== digest)) throw new AppError({ code: ErrorCodes.FILE_INTEGRITY_FAILED, message: 'WebDAV download failed SHA-256 verification', statusCode: HttpStatus.CONFLICT });
    const request = session.request as Record<string, unknown>;
    const source = await this.prisma.fileAsset.findFirst({ where: { id: String(request.fileAssetId), status: 'ACTIVE' } });
    if (!source) throw this.outputInvalid('Target file asset no longer exists');
    const assetId = resolution === 'CREATE_COPY' ? randomUUID() : source.id;
    const versionId = randomUUID();
    const storageKey = `files/${assetId}/${versionId}`;
    await this.storage.write({ key: storageKey, content: bytes, mimeType: 'application/octet-stream' });
    return {
      apply: async (tx) => {
        let versionNumber = 1;
        if (resolution === 'CREATE_COPY') {
          await tx.fileAsset.create({
            data: {
              id: assetId, name: `${source.name}（远端副本）`, documentId: source.documentId,
              projectId: source.projectId, meetingId: source.meetingId, partnerId: source.partnerId,
              nonProjectRdItemId: source.nonProjectRdItemId,
              nonProjectRdOutcomeId: source.nonProjectRdOutcomeId,
            },
          });
        } else {
          const current = await tx.fileVersion.findFirst({
            where: { fileAssetId: assetId },
            orderBy: { versionNumber: 'desc' },
            select: { sha256: true },
          });
          if (!current || current.sha256 !== item.localHash) {
            throw this.conflict('File changed after preflight');
          }
          const latest = await tx.fileVersion.aggregate({ where: { fileAssetId: assetId }, _max: { versionNumber: true } });
          versionNumber = (latest._max.versionNumber ?? 0) + 1;
        }
        await tx.fileVersion.create({
          data: {
            id: versionId, fileAssetId: assetId, versionNumber, storageKey,
            originalName: source.name, mimeType: 'application/octet-stream', size: bytes.byteLength, sha256: digest,
          },
        });
        await this.upsertLink(tx, session.profileId, item, assetId, parsed.data.remoteVersion, digest, ExternalSyncDirection.BIDIRECTIONAL, resolution);
        await tx.externalSyncSession.update({ where: { id: session.id }, data: { status: 'COMMITTED', committedAt: new Date(), errorCode: null } });
      },
      rollback: async () => { await this.storage.delete(storageKey).catch(() => undefined); },
    };
  }

  private async applyCalendarDecisions(
    tx: Tx,
    profileId: string,
    preflight: AuthoritativePreflight,
    byKey: Map<string, SyncResolution['resolution']>,
    committedVersions: Map<string, string | undefined>,
  ) {
    for (const item of preflight.items) {
      const resolution = byKey.get(item.itemKey)!;
      if (resolution === 'KEEP_LOCAL') {
        if (!item.localId) throw this.outputInvalid('KEEP_LOCAL calendar item has no local event');
        await this.upsertLink(tx, profileId, item, item.localId, committedVersions.get(item.remoteId), item.localHash!, preflight.direction, resolution);
        continue;
      }
      const preview = item.remotePreview;
      if (!preview) throw this.outputInvalid('Remote calendar preview is missing');
      let localId = item.localId;
      if (resolution === 'CREATE_COPY' || !localId) {
        const created = await tx.calendarEvent.create({
          data: {
            title: resolution === 'CREATE_COPY' ? `${preview.title}（远端副本）` : preview.title,
            startAt: new Date(preview.startAt), endAt: new Date(preview.endAt), allDay: preview.allDay,
            location: preview.location, link: preview.link, notes: preview.notes, type: 'FOCUS',
          },
        });
        localId = created.id;
      } else {
        await tx.calendarEvent.update({
          where: { id: localId },
          data: {
            title: preview.title, startAt: new Date(preview.startAt), endAt: new Date(preview.endAt),
            allDay: preview.allDay, location: preview.location, link: preview.link, notes: preview.notes,
          },
        });
      }
      await this.upsertLink(tx, profileId, item, localId, item.remoteVersion, item.remoteHash!, preflight.direction, resolution);
    }
  }

  private async upsertLink(
    tx: Tx,
    profileId: string,
    item: AuthoritativeItem,
    localId: string,
    remoteVersion: string | undefined,
    syncHash: string,
    syncDirection: ExternalSyncDirection,
    resolution: SyncResolution['resolution'],
  ) {
    await tx.externalObjectLink.upsert({
      where: { profileId_remoteId: { profileId, remoteId: item.remoteId } },
      update: {
        localType: item.localType, localId, remoteVersion,
        syncDirection, lastSyncedAt: new Date(), syncHash,
        conflictState: ExternalConflictState[resolution],
      },
      create: {
        profileId, localType: item.localType, localId, remoteId: item.remoteId, remoteVersion,
        syncDirection, lastSyncedAt: new Date(), syncHash,
        conflictState: ExternalConflictState[resolution],
      },
    });
  }

  private calendarCollection(config: Record<string, unknown>) {
    if (typeof config.baseUrl !== 'string' || typeof config.calendarPath !== 'string') throw this.outputInvalid('CalDAV profile config is invalid');
    const base = new URL(config.baseUrl);
    const collection = new URL(config.calendarPath, base);
    if (!['http:', 'https:'].includes(base.protocol) || collection.origin !== base.origin) throw this.outputInvalid('CalDAV collection must stay on the configured host');
    return collection;
  }

  private assertCalendarRemoteId(collection: URL, remoteId: string) {
    const resolved = new URL(remoteId, collection);
    const root = collection.pathname.endsWith('/') ? collection.pathname : `${collection.pathname}/`;
    if (resolved.origin !== collection.origin || !resolved.pathname.startsWith(root)) throw this.outputInvalid('CalDAV remote id escaped the configured collection');
    return resolved.pathname;
  }

  private parseIcal(ical: string): CalendarPreview {
    const unfolded = ical.replace(/\r?\n[ \t]/g, '');
    const block = unfolded.match(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/i)?.[1];
    if (!block) throw this.outputInvalid('CalDAV response has no VEVENT');
    const values = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      const index = line.indexOf(':');
      if (index <= 0) continue;
      values.set(line.slice(0, index).split(';')[0]!.toUpperCase(), line.slice(index + 1));
    }
    const title = this.unescapeIcal(values.get('SUMMARY') ?? '').trim();
    const start = this.parseIcalDate(values.get('DTSTART'));
    const end = this.parseIcalDate(values.get('DTEND'));
    if (!title || !start || !end || end.date.getTime() <= start.date.getTime()) throw this.outputInvalid('CalDAV event fields are invalid');
    return {
      title: title.slice(0, 500), startAt: start.date.toISOString(), endAt: end.date.toISOString(),
      allDay: start.allDay, location: this.optionalIcal(values.get('LOCATION')),
      link: this.optionalIcal(values.get('URL')), notes: this.optionalIcal(values.get('DESCRIPTION')),
    };
  }

  private parseIcalDate(value?: string) {
    if (!value) return undefined;
    if (/^\d{8}$/.test(value)) {
      const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
      return Number.isNaN(date.getTime()) ? undefined : { date, allDay: true };
    }
    if (!/^\d{8}T\d{6}Z$/.test(value)) return undefined;
    const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.000Z`);
    return Number.isNaN(date.getTime()) ? undefined : { date, allDay: false };
  }

  private optionalIcal(value?: string) {
    const result = value ? this.unescapeIcal(value).trim().slice(0, 4000) : '';
    return result || null;
  }

  private unescapeIcal(value: string) {
    return value.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');
  }

  private parseStoredPreflight(value: Prisma.JsonValue | null) {
    return value as unknown as AuthoritativePreflight;
  }

  private parseStoredResolutions(value: Prisma.JsonValue | null) {
    const parsed = z.array(z.object({ itemKey: z.string(), resolution: z.enum(['KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY']) })).safeParse(value);
    if (!parsed.success) throw this.outputInvalid('Stored external sync resolutions are invalid');
    return parsed.data;
  }

  private requireSessionShape() {
    return this.prisma.externalSyncSession.findFirstOrThrow({ include: { profile: true } });
  }

  private invalid(message: string) {
    return new AppError({ code: ErrorCodes.EXTENSION_CONFIG_INVALID, message, statusCode: HttpStatus.BAD_REQUEST });
  }

  private outputInvalid(details?: unknown) {
    return new AppError({ code: ErrorCodes.EXTERNAL_SYNC_OUTPUT_INVALID, message: 'External provider output is invalid', statusCode: HttpStatus.BAD_REQUEST, details });
  }

  private conflict(message: string) {
    return new AppError({ code: ErrorCodes.EXTERNAL_SYNC_CONFLICT, message, statusCode: HttpStatus.CONFLICT });
  }
}
