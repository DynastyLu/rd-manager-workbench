import { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { closeE2eApp, createE2eApp } from './helpers/e2e-app';

describe('paper-excel-ocr auth compatibility e2e', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await createE2eApp());
  });

  afterAll(async () => {
    await closeE2eApp(app, prisma);
  });

  it('logs in the seeded admin, refreshes, reads me, manages users, and logs out', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'e2e_admin', password: 'changeme123' });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      accessToken: expect.any(String),
      user: { username: 'e2e_admin', role: 'admin' },
    });
    const cookie = login.headers['set-cookie'];
    expect(String(cookie)).toContain('refresh_token=');

    const accessToken = login.body.accessToken as string;
    const adminUser = await prisma.paperUser.findUnique({
      where: { username: 'e2e_admin' },
      include: { refreshTokens: true },
    });
    expect(adminUser).toMatchObject({
      username: 'e2e_admin',
      role: 'admin',
    });
    expect(adminUser?.refreshTokens).toHaveLength(1);

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ username: 'e2e_admin', role: 'admin' });

    const operatorUsername = `e2e_operator_${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ username: operatorUsername, password: 'operator123', role: 'user' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ username: operatorUsername, role: 'user' });
    await expect(
      prisma.paperUser.findUnique({ where: { username: operatorUsername } }),
    ).resolves.toMatchObject({
      username: operatorUsername,
      role: 'user',
    });

    const listed = await request(app.getHttpServer())
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listed.status).toBe(200);
    expect(listed.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ username: operatorUsername, role: 'user' })]),
    );

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', cookie);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body).toMatchObject({ accessToken: expect.any(String) });
    await expect(
      prisma.paperRefreshToken.count({ where: { user: { username: 'e2e_admin' } } }),
    ).resolves.toBe(2);

    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`);

    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ success: true });
    await expect(
      prisma.paperRefreshToken.count({
        where: {
          user: { username: 'e2e_admin' },
          revoked: true,
        },
      }),
    ).resolves.toBeGreaterThan(0);
  });

  it('keeps legacy auth error payloads raw', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: '', password: '' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'INVALID_INPUT',
      message: '用户名和密码不能为空',
    });
  });
});
