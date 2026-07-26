import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { posix } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ExtensionKind,
  ExtensionProfile,
  ExtensionRun,
  ExtensionRunStatus,
  Prisma,
  SmsDeliveryStatus,
} from '@prisma/client';
import { z } from 'zod';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import {
  CompleteExtensionRunDto,
  CreateExtensionProfileDto,
  PrepareExtensionRunDto,
  StartExtensionRunDto,
  UpdateExtensionProfileDto,
} from '../interface/http/dto/extensions.dto';
import { parseAiOutput } from '../domain/ai-output';
import { ExternalSyncCompletionService } from './external-sync-completion.service';

const PROVIDERS: Readonly<Record<ExtensionKind, readonly string[]>> = {
  SMS: ['LOCAL_PREVIEW', 'ALIYUN_SMS'],
  AI: ['LOCAL_MANUAL', 'OPENAI_RESPONSES', 'DEEPSEEK_CHAT'],
  CALENDAR: ['CALDAV'],
  CLOUD_DRIVE: ['WEBDAV'],
};

const OPERATIONS: Readonly<Record<string, readonly string[]>> = {
  LOCAL_PREVIEW: ['TEST_CONNECTION', 'SMS_PREVIEW'],
  ALIYUN_SMS: ['TEST_CONNECTION', 'SMS_SEND'],
  LOCAL_MANUAL: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
  OPENAI_RESPONSES: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
  DEEPSEEK_CHAT: ['TEST_CONNECTION', 'AI_SUMMARIZE_MEETING', 'AI_SUMMARIZE_DOCUMENT', 'AI_KNOWLEDGE_QA'],
  CALDAV: ['TEST_CONNECTION', 'CALENDAR_SYNC_PREFLIGHT', 'CALENDAR_SYNC_COMMIT'],
  WEBDAV: ['TEST_CONNECTION', 'CLOUD_UPLOAD_PREFLIGHT', 'CLOUD_UPLOAD_COMMIT', 'CLOUD_DOWNLOAD_PREFLIGHT', 'CLOUD_DOWNLOAD_COMMIT'],
};

const CONFIG_SCHEMAS: Readonly<Record<string, z.ZodType<Record<string, unknown>>>> = {
  LOCAL_PREVIEW: z.object({
    templateMapping: z.record(z.string().min(1).max(120)).default({}),
    costEstimateCny: z.number().min(0).optional(),
  }).strict(),
  ALIYUN_SMS: z.object({
    regionId: z.string().min(1).max(40).default('cn-hangzhou'),
    signName: z.string().min(1).max(100),
    templateMapping: z.record(z.string().regex(/^SMS_[A-Za-z0-9]+$/)),
  }).strict(),
  LOCAL_MANUAL: z.object({ model: z.literal('manual').default('manual') }).strict(),
  OPENAI_RESPONSES: z.object({
    model: z.string().min(1).max(100),
    maxOutputTokens: z.number().int().min(128).max(16_384).optional(),
  }).strict(),
  DEEPSEEK_CHAT: z.object({
    model: z.literal('deepseek-v4-pro').default('deepseek-v4-pro'),
    maxOutputTokens: z.number().int().min(128).max(16_384).optional(),
  }).strict(),
  CALDAV: z.object({
    baseUrl: z.string().url(),
    calendarPath: z.string().min(1).max(500),
    syncDirection: z.enum(['PULL_ONLY', 'BIDIRECTIONAL']).default('PULL_ONLY'),
  }).strict(),
  WEBDAV: z.object({ baseUrl: z.string().url(), remoteRoot: z.string().min(1).max(500) }).strict(),
};

const SECRET_KEYS = new Set([
  'key', 'token', 'secret', 'password', 'phone', 'phonenumber', 'apikey',
  'accesskey', 'accesskeyid', 'accesskeysecret', 'credential', 'credentials',
]);
const LOCAL_PROVIDERS = new Set(['LOCAL_PREVIEW', 'LOCAL_MANUAL']);
const MAX_RUN_INPUT_BYTES = 1024 * 1024;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(canonicalize(value)), 'utf8');
}

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function assertNoSecretKeys(value: unknown, path = 'publicConfig') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SECRET_KEYS.has(normalized)) {
      throw new AppError({
        code: ErrorCodes.EXTENSION_SECRET_IN_CONFIG,
        message: `Secret field is not allowed in public config: ${path}.${key}`,
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
    assertNoSecretKeys(child, `${path}.${key}`);
  }
}

@Injectable()
export class ExtensionsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly externalSyncCompletion: ExternalSyncCompletionService,
  ) {}

  listProfiles(kind?: ExtensionKind) {
    return this.prisma.extensionProfile.findMany({
      where: { archivedAt: null, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    }).then((profiles) => profiles.map((profile) => this.publicProfile(profile)));
  }

  async getProfile(id: string) {
    return this.publicProfile(await this.requireProfile(id));
  }

  async createProfile(dto: CreateExtensionProfileDto) {
    const publicConfig = this.validateConfig(dto.kind, dto.provider, dto.publicConfig);
    this.assertCredential(dto.provider, dto.enabled ?? false, dto.credentialRef);
    try {
      const profile = await this.prisma.extensionProfile.create({
        data: {
          kind: dto.kind,
          provider: dto.provider,
          name: dto.name,
          enabled: dto.enabled ?? false,
          publicConfig: publicConfig as Prisma.InputJsonValue,
          credentialRef: dto.credentialRef,
          permissions: this.validatePermissions(dto.provider, dto.permissions ?? []),
        },
      });
      return this.publicProfile(profile);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.invalidConfig('An active extension profile with this name already exists', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateProfile(id: string, dto: UpdateExtensionProfileDto) {
    const current = await this.requireProfile(id);
    const publicConfig = dto.publicConfig === undefined
      ? current.publicConfig
      : this.validateConfig(current.kind, current.provider, dto.publicConfig);
    const credentialRef = dto.credentialRef === undefined ? current.credentialRef : dto.credentialRef;
    const enabled = dto.enabled ?? current.enabled;
    this.assertCredential(current.provider, enabled, credentialRef);
    const profile = await this.prisma.extensionProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        enabled,
        publicConfig: publicConfig as Prisma.InputJsonValue,
        credentialRef,
        ...(dto.permissions !== undefined
          ? { permissions: this.validatePermissions(current.provider, dto.permissions) }
          : {}),
      },
    });
    return this.publicProfile(profile);
  }

  async archiveProfile(id: string) {
    await this.requireProfile(id);
    await this.prisma.extensionProfile.update({ where: { id }, data: { enabled: false, archivedAt: new Date() } });
  }

  async prepareRun(profileId: string, dto: PrepareExtensionRunDto) {
    const profile = await this.requireRunnableProfile(profileId, dto.operation);
    const hashes = this.runHashes(profile, dto.operation, dto.payload);
    return {
      operation: dto.operation,
      ...hashes,
      requiresConfirmation: true,
      dataLeavesDevice: !LOCAL_PROVIDERS.has(profile.provider),
      provider: profile.provider,
    };
  }

  async startRun(profileId: string, dto: StartExtensionRunDto) {
    const profile = await this.requireRunnableProfile(profileId, dto.operation);
    const hashes = this.runHashes(profile, dto.operation, dto.payload);
    this.assertAiPayload(dto.operation, dto.payload);
    if (dto.confirmationHash !== hashes.confirmationHash) {
      throw new AppError({
        code: ErrorCodes.EXTENSION_CONFIRMATION_REQUIRED,
        message: 'Run confirmation does not match the prepared payload',
        statusCode: HttpStatus.CONFLICT,
      });
    }
    if (profile.provider === 'LOCAL_PREVIEW') {
      const run = await this.prisma.extensionRun.create({
        data: {
          profileId,
          operation: dto.operation,
          status: ExtensionRunStatus.REJECTED,
          inputSha256: hashes.inputSha256,
          inputBytes: hashes.inputBytes,
          confirmationHash: hashes.confirmationHash,
          errorCode: 'PREVIEW_ONLY',
          metadata: this.metadataFromPayload(dto.payload),
          finishedAt: new Date(),
        },
      });
      return this.publicRun(run);
    }
    const completionToken = randomBytes(32).toString('base64url');
    const run = await this.prisma.extensionRun.create({
      data: {
        profileId,
        operation: dto.operation,
        status: ExtensionRunStatus.RUNNING,
        inputSha256: hashes.inputSha256,
        inputBytes: hashes.inputBytes,
        confirmationHash: hashes.confirmationHash,
        completionTokenHash: sha256(completionToken),
        metadata: this.metadataFromPayload(dto.payload),
        startedAt: new Date(),
      },
    });
    return { ...this.publicRun(run), completionToken };
  }

  async completeRun(id: string, dto: CompleteExtensionRunDto) {
    const run = await this.prisma.extensionRun.findUnique({ where: { id } });
    if (!run) throw this.notFound(ErrorCodes.EXTENSION_RUN_NOT_FOUND, 'Extension run not found');
    if (run.operation.startsWith('AI_') && dto.status === 'SUCCEEDED') {
      const metadata = run.metadata as Record<string, unknown>;
      const citationIds = Array.isArray(metadata.citationIds)
        ? metadata.citationIds.filter((item): item is string => typeof item === 'string')
        : [];
      const parsed = parseAiOutput(citationIds, dto.output);
      if (!parsed.success) {
        throw new AppError({
          code: ErrorCodes.AI_OUTPUT_INVALID,
          message: parsed.reason === 'citation'
            ? 'AI output contains an unknown citation'
            : 'AI output does not match the required schema',
          statusCode: HttpStatus.BAD_REQUEST,
          details: parsed.reason === 'schema' ? parsed.details : undefined,
        });
      }
    }
    const output = encoded(dto.output ?? null);
    const outputSha256 = sha256(output);
    if (['SUCCEEDED', 'FAILED', 'REJECTED'].includes(run.status)) {
      if (
        run.status === dto.status
        && run.outputSha256 === outputSha256
        && run.completionReceiptHash
        && this.matchesTokenHash(run.completionReceiptHash, dto.completionToken)
      ) {
        await this.prisma.$transaction((tx) => this.completeSmsDelivery(run, dto.metadata, tx));
        return this.publicRun(run);
      }
      throw this.invalidToken('Extension run has already completed');
    }
    if (run.status !== ExtensionRunStatus.RUNNING || !run.completionTokenHash) {
      throw this.invalidToken('Extension run is not awaiting completion');
    }
    const expected = Buffer.from(run.completionTokenHash, 'hex');
    const received = Buffer.from(sha256(dto.completionToken), 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw this.invalidToken('Invalid extension run completion token');
    }
    const externalCompletion = await this.externalSyncCompletion.prepare(run, dto);
    let completed: ExtensionRun;
    let claimed = false;
    try {
      completed = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.extensionRun.updateMany({
          where: {
            id,
            status: ExtensionRunStatus.RUNNING,
            completionTokenHash: run.completionTokenHash,
          },
          data: {
            status: dto.status,
            outputSha256,
            outputBytes: output.byteLength,
            errorCode: dto.status === 'SUCCEEDED' ? null : (dto.errorCode ?? 'PROVIDER_REJECTED'),
            metadata: this.sanitizeCompletionMetadata(run.metadata, dto.metadata),
            completionReceiptHash: run.completionTokenHash,
            completionTokenHash: null,
            finishedAt: new Date(),
          },
        });
        if (!claim.count) {
          const current = await tx.extensionRun.findUniqueOrThrow({ where: { id } });
          if (current.status === dto.status && current.outputSha256 === outputSha256) return current;
          throw this.invalidToken('Extension run has already completed');
        }
        claimed = true;
        await externalCompletion?.apply(tx);
        const terminalRun = await tx.extensionRun.findUniqueOrThrow({ where: { id } });
        await this.completeSmsDelivery(terminalRun, dto.metadata, tx);
        return terminalRun;
      });
    } catch (error) {
      await externalCompletion?.rollback();
      throw error;
    }
    if (!claimed) await externalCompletion?.rollback();
    return this.publicRun(completed);
  }

  listRuns(profileId?: string) {
    return this.prisma.extensionRun.findMany({
      where: profileId ? { profileId } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    }).then((runs) => runs.map((run) => this.publicRun(run)));
  }

  private validateConfig(kind: ExtensionKind, provider: string, config: Record<string, unknown>) {
    assertNoSecretKeys(config);
    if (!PROVIDERS[kind]?.includes(provider) || !CONFIG_SCHEMAS[provider]) {
      throw this.invalidConfig('Provider does not support the selected extension kind');
    }
    const result = CONFIG_SCHEMAS[provider].safeParse(config);
    if (!result.success) {
      throw this.invalidConfig('Extension public config is invalid', HttpStatus.BAD_REQUEST, result.error.flatten());
    }
    if (provider === 'WEBDAV' || provider === 'CALDAV') this.assertPublicBaseUrl(result.data.baseUrl);
    if (provider === 'WEBDAV') this.assertRemoteRoot(result.data.remoteRoot);
    if (provider === 'CALDAV') this.assertRemoteRoot(result.data.calendarPath);
    return result.data;
  }

  private assertPublicBaseUrl(value: unknown) {
    let url: URL;
    try {
      url = new URL(String(value));
    } catch {
      throw this.invalidConfig('External service base URL is invalid');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new AppError({
        code: ErrorCodes.EXTENSION_SECRET_IN_CONFIG,
        message: 'External service base URL cannot contain credentials, query parameters or fragments',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw this.invalidConfig('External service base URL must use HTTP or HTTPS');
    }
  }

  private assertRemoteRoot(remoteRoot: unknown) {
    let decoded = '';
    try {
      decoded = typeof remoteRoot === 'string' ? decodeURIComponent(remoteRoot) : '';
    } catch {
      decoded = '';
    }
    if (
      typeof remoteRoot !== 'string'
      || !remoteRoot.startsWith('/')
      || remoteRoot.startsWith('//')
      || decoded.startsWith('//')
      || decoded.includes('\\')
      || decoded.includes('\0')
      || decoded.includes('?')
      || decoded.includes('#')
      || posix.normalize(decoded) !== decoded
    ) {
      throw new AppError({ code: ErrorCodes.EXTERNAL_PATH_INVALID, message: 'WebDAV remote root must be a normalized remote collection path', statusCode: HttpStatus.BAD_REQUEST });
    }
  }

  private validatePermissions(provider: string, permissions: string[]) {
    const allowed = OPERATIONS[provider] ?? [];
    if (permissions.some((permission) => !allowed.includes(permission))) {
      throw this.unsupported('Profile contains an unsupported permission');
    }
    return permissions;
  }

  private assertCredential(provider: string, enabled: boolean, credentialRef?: string | null) {
    if (enabled && !LOCAL_PROVIDERS.has(provider) && !credentialRef) {
      throw new AppError({ code: ErrorCodes.CREDENTIAL_NOT_FOUND, message: 'An enabled external provider requires a credential reference', statusCode: HttpStatus.UNPROCESSABLE_ENTITY });
    }
  }

  private async requireRunnableProfile(id: string, operation: string) {
    const profile = await this.requireProfile(id);
    if (!profile.enabled) {
      throw new AppError({ code: ErrorCodes.EXTENSION_PROFILE_DISABLED, message: 'Extension profile is disabled', statusCode: HttpStatus.CONFLICT });
    }
    this.assertCredential(profile.provider, true, profile.credentialRef);
    if (!OPERATIONS[profile.provider]?.includes(operation) || !profile.permissions.includes(operation)) {
      throw this.unsupported('Operation is not permitted for this profile');
    }
    return profile;
  }

  private async requireProfile(id: string) {
    const profile = await this.prisma.extensionProfile.findFirst({ where: { id, archivedAt: null } });
    if (!profile) throw this.notFound(ErrorCodes.EXTENSION_PROFILE_NOT_FOUND, 'Extension profile not found');
    return profile;
  }

  private runHashes(profile: ExtensionProfile, operation: string, payload: Record<string, unknown>) {
    const input = encoded(payload);
    if (input.byteLength > MAX_RUN_INPUT_BYTES) throw this.invalidConfig('Extension run payload exceeds 1 MiB');
    const inputSha256 = sha256(input);
    const confirmationHash = sha256(encoded({ profileId: profile.id, provider: profile.provider, operation, inputSha256 }));
    return { inputSha256, inputBytes: input.byteLength, confirmationHash };
  }

  private metadataFromPayload(payload: Record<string, unknown>): Prisma.InputJsonObject {
    const metadata: Record<string, Prisma.InputJsonValue> = {};
    for (const key of ['objectIds', 'citationIds', 'recipientId', 'templateKey', 'localType', 'localId', 'remoteId']) {
      const value = payload[key];
      if (typeof value === 'string') metadata[key] = value;
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) metadata[key] = value;
    }
    return metadata as Prisma.InputJsonObject;
  }

  private sanitizeCompletionMetadata(existing: Prisma.JsonValue, input?: Record<string, unknown>): Prisma.InputJsonObject {
    const result: Record<string, Prisma.InputJsonValue> = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Prisma.JsonObject) } as Record<string, Prisma.InputJsonValue>
      : {};
    if (!input) return result;
    for (const key of ['providerMessageId', 'costEstimateCny', 'retryable', 'citationIds', 'remoteVersion']) {
      const value = input[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') result[key] = value;
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) result[key] = value;
    }
    return result as Prisma.InputJsonObject;
  }

  private assertAiPayload(operation: string, payload: Record<string, unknown>) {
    if (!operation.startsWith('AI_')) return;
    if (!Array.isArray(payload.citationIds) || !payload.citationIds.every((item) => typeof item === 'string')) {
      throw new AppError({
        code: ErrorCodes.AI_OUTPUT_INVALID,
        message: 'AI runs require a prepared citation allowlist',
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private publicProfile(profile: ExtensionProfile) {
    return { ...profile, credentialConfigured: Boolean(profile.credentialRef) };
  }

  private async completeSmsDelivery(
    run: ExtensionRun,
    metadata: Record<string, unknown> | undefined,
    client: PlatformPrismaService | Prisma.TransactionClient,
  ) {
    const delivery = await client.smsDelivery.findUnique({
      where: { extensionRunId: run.id },
      select: { id: true, attemptCount: true },
    });
    if (!delivery) return;
    if (run.status === ExtensionRunStatus.SUCCEEDED) {
      await client.smsDelivery.update({
        where: { id: delivery.id },
        data: {
          status: SmsDeliveryStatus.SENT,
          sentAt: run.finishedAt,
          providerMessageId: typeof metadata?.providerMessageId === 'string' ? metadata.providerMessageId : null,
          errorCode: null,
        },
      });
      return;
    }
    const retryable = metadata?.retryable === true && delivery.attemptCount < 3;
    await client.smsDelivery.update({
      where: { id: delivery.id },
      data: {
        status: retryable ? SmsDeliveryStatus.PENDING : SmsDeliveryStatus.FAILED,
        nextAttemptAt: retryable
          ? new Date(Date.now() + 60_000 * (2 ** Math.max(0, delivery.attemptCount - 1)))
          : null,
        errorCode: run.errorCode,
      },
    });
  }

  private publicRun(run: ExtensionRun) {
    const {
      completionTokenHash: _completionTokenHash,
      completionReceiptHash: _completionReceiptHash,
      ...safe
    } = run;
    void _completionTokenHash;
    void _completionReceiptHash;
    return safe;
  }

  private matchesTokenHash(expectedHash: string, token: string) {
    const expected = Buffer.from(expectedHash, 'hex');
    const received = Buffer.from(sha256(token), 'hex');
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  private invalidConfig(message: string, statusCode = HttpStatus.BAD_REQUEST, details?: unknown) {
    return new AppError({ code: ErrorCodes.EXTENSION_CONFIG_INVALID, message, statusCode, details });
  }

  private unsupported(message: string) {
    return new AppError({ code: ErrorCodes.EXTENSION_OPERATION_UNSUPPORTED, message, statusCode: HttpStatus.BAD_REQUEST });
  }

  private invalidToken(message: string) {
    return new AppError({ code: ErrorCodes.EXTENSION_RUN_TOKEN_INVALID, message, statusCode: HttpStatus.UNAUTHORIZED });
  }

  private notFound(code: typeof ErrorCodes.EXTENSION_PROFILE_NOT_FOUND | typeof ErrorCodes.EXTENSION_RUN_NOT_FOUND, message: string) {
    return new AppError({ code, message, statusCode: HttpStatus.NOT_FOUND });
  }
}
