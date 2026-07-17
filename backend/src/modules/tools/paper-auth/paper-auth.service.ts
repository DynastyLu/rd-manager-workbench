import { Injectable, OnModuleInit } from '@nestjs/common';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PlatformPrismaService } from '../../../infrastructure/prisma/platform-prisma.service';

export interface PaperUserView {
  id: number;
  username: string;
  role: string;
  created_at?: string;
}

interface PaperUserRecord extends PaperUserView {
  password_hash: string;
}

interface PaperRefreshTokenRecord {
  id: number;
  user_id: number;
  token_hash: string;
  revoked: boolean;
  expires_at: Date;
}

interface AccessPayload {
  id: number;
  username: string;
  role: string;
}

@Injectable()
export class PaperAuthService implements OnModuleInit {
  private readonly memoryUsers = new Map<number, PaperUserRecord>();
  private readonly memoryRefreshTokens = new Map<number, PaperRefreshTokenRecord>();
  private nextUserId = 1;
  private nextRefreshTokenId = 1;

  constructor(private readonly prisma: PlatformPrismaService) {}

  async onModuleInit() {
    await this.seedAdmin();
  }

  async seedAdmin() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const existing = await this.findUserByUsernameWithHash(username);
    if (existing) {
      return;
    }

    const passwordHash = await this.hashPassword(password);
    if (this.hasPrismaPaperModels()) {
      await this.prisma.paperUser.upsert({
        where: { username },
        create: { username, passwordHash, role: 'admin' },
        update: {},
      });
      return;
    }

    await this.createUser(username, passwordHash, 'admin');
  }

  hashPassword(plain: string) {
    return bcrypt.hash(plain, 12);
  }

  verifyPassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }

  signAccessToken(payload: AccessPayload) {
    return jwt.sign(payload, this.jwtSecret(), { expiresIn: this.jwtExpiresIn() as jwt.SignOptions['expiresIn'] });
  }

  verifyAccessToken(token: string): AccessPayload | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret());
      if (
        typeof payload === 'object' &&
        typeof payload.id === 'number' &&
        typeof payload.username === 'string' &&
        typeof payload.role === 'string'
      ) {
        return { id: payload.id, username: payload.username, role: payload.role };
      }
      return null;
    } catch {
      return null;
    }
  }

  async createRefreshToken(userId: number) {
    const raw = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + this.refreshExpiresDays() * 86400_000);

    if (this.hasPrismaPaperModels()) {
      await this.prisma.paperRefreshToken.create({
        data: { userId, tokenHash, expiresAt },
      });
      await this.prisma.paperRefreshToken.deleteMany({
        where: { userId, expiresAt: { lt: new Date() } },
      });
      return raw;
    }

    this.memoryRefreshTokens.set(this.nextRefreshTokenId, {
      id: this.nextRefreshTokenId,
      user_id: userId,
      token_hash: tokenHash,
      revoked: false,
      expires_at: expiresAt,
    });
    this.nextRefreshTokenId += 1;
    for (const [id, token] of this.memoryRefreshTokens.entries()) {
      if (token.user_id === userId && token.expires_at < new Date()) {
        this.memoryRefreshTokens.delete(id);
      }
    }
    return raw;
  }

  async rotateRefreshToken(rawOldToken: string) {
    const oldHash = this.hashToken(rawOldToken);
    const row = await this.findRefreshTokenByHash(oldHash);
    if (!row) {
      return { error: 'TOKEN_MISSING' as const };
    }
    if (row.revoked) {
      await this.revokeAllRefreshTokensForUser(row.user_id);
      return { error: 'TOKEN_REVOKED' as const };
    }
    if (row.expires_at < new Date()) {
      return { error: 'TOKEN_EXPIRED' as const };
    }

    await this.markRefreshTokenRevoked(row.id);
    const newRaw = await this.createRefreshToken(row.user_id);
    const user = await this.findUserById(row.user_id);
    if (!user) {
      return { error: 'TOKEN_INVALID' as const };
    }
    return { newRaw, user };
  }

  async revokeRefreshToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    if (this.hasPrismaPaperModels()) {
      await this.prisma.paperRefreshToken.updateMany({
        where: { tokenHash },
        data: { revoked: true },
      });
      return;
    }

    for (const token of this.memoryRefreshTokens.values()) {
      if (token.token_hash === tokenHash) {
        token.revoked = true;
      }
    }
  }

  async revokeAllRefreshTokensForUser(userId: number) {
    if (this.hasPrismaPaperModels()) {
      await this.prisma.paperRefreshToken.updateMany({
        where: { userId },
        data: { revoked: true },
      });
      return;
    }

    for (const token of this.memoryRefreshTokens.values()) {
      if (token.user_id === userId) {
        token.revoked = true;
      }
    }
  }

  async findUserById(id: number): Promise<PaperUserView | null> {
    if (this.hasPrismaPaperModels()) {
      const user = await this.prisma.paperUser.findUnique({
        where: { id },
        select: { id: true, username: true, role: true },
      });
      return user;
    }

    const user = this.memoryUsers.get(id);
    return user ? this.toView(user) : null;
  }

  async findUserByUsernameWithHash(username: string): Promise<PaperUserRecord | null> {
    if (this.hasPrismaPaperModels()) {
      const user = await this.prisma.paperUser.findUnique({ where: { username } });
      if (!user) {
        return null;
      }
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        password_hash: user.passwordHash,
        created_at: user.createdAt.toISOString(),
      };
    }

    return [...this.memoryUsers.values()].find((user) => user.username === username) || null;
  }

  async getAllUsers(): Promise<PaperUserView[]> {
    if (this.hasPrismaPaperModels()) {
      const users = await this.prisma.paperUser.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, username: true, role: true, createdAt: true },
      });
      return users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.createdAt.toISOString(),
      }));
    }

    return [...this.memoryUsers.values()].sort((a, b) => a.id - b.id).map((user) => this.toView(user));
  }

  async createUser(username: string, passwordHash: string, role: string): Promise<PaperUserView> {
    if (this.hasPrismaPaperModels()) {
      const user = await this.prisma.paperUser.create({
        data: { username, passwordHash, role },
        select: { id: true, username: true, role: true, createdAt: true },
      });
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.createdAt.toISOString(),
      };
    }

    if ([...this.memoryUsers.values()].some((user) => user.username === username)) {
      const error = new Error('UNIQUE constraint failed');
      throw error;
    }
    const record: PaperUserRecord = {
      id: this.nextUserId,
      username,
      role,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };
    this.memoryUsers.set(record.id, record);
    this.nextUserId += 1;
    return this.toView(record);
  }

  async updateUserRole(id: number, role: string): Promise<PaperUserView | null> {
    if (this.hasPrismaPaperModels()) {
      try {
        const user = await this.prisma.paperUser.update({
          where: { id },
          data: { role },
          select: { id: true, username: true, role: true, createdAt: true },
        });
        return {
          id: user.id,
          username: user.username,
          role: user.role,
          created_at: user.createdAt.toISOString(),
        };
      } catch {
        return null;
      }
    }

    const user = this.memoryUsers.get(id);
    if (!user) {
      return null;
    }
    user.role = role;
    return this.toView(user);
  }

  async deleteUser(id: number) {
    if (this.hasPrismaPaperModels()) {
      try {
        await this.prisma.paperUser.delete({ where: { id } });
        return 1;
      } catch {
        return 0;
      }
    }

    return this.memoryUsers.delete(id) ? 1 : 0;
  }

  private async findRefreshTokenByHash(tokenHash: string): Promise<PaperRefreshTokenRecord | null> {
    if (this.hasPrismaPaperModels()) {
      const token = await this.prisma.paperRefreshToken.findUnique({ where: { tokenHash } });
      if (!token) {
        return null;
      }
      return {
        id: token.id,
        user_id: token.userId,
        token_hash: token.tokenHash,
        revoked: token.revoked,
        expires_at: token.expiresAt,
      };
    }

    return [...this.memoryRefreshTokens.values()].find((token) => token.token_hash === tokenHash) || null;
  }

  private async markRefreshTokenRevoked(id: number) {
    if (this.hasPrismaPaperModels()) {
      await this.prisma.paperRefreshToken.update({
        where: { id },
        data: { revoked: true },
      });
      return;
    }

    const token = this.memoryRefreshTokens.get(id);
    if (token) {
      token.revoked = true;
    }
  }

  private hashToken(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private jwtSecret() {
    return process.env.JWT_SECRET || 'dev-secret-change-in-production';
  }

  private jwtExpiresIn() {
    return process.env.JWT_EXPIRES_IN || '15m';
  }

  private refreshExpiresDays() {
    return Number.parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10) || 7;
  }

  private hasPrismaPaperModels() {
    return Boolean(
      (this.prisma as unknown as { paperUser?: unknown }).paperUser &&
        (this.prisma as unknown as { paperRefreshToken?: unknown }).paperRefreshToken,
    );
  }

  private toView(user: PaperUserRecord): PaperUserView {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
    };
  }
}
