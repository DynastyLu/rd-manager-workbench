import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PaperAuthService, PaperUserView } from '../../paper-auth.service';

@Controller('auth')
export class PaperAuthController {
  constructor(private readonly authService: PaperAuthService) {}

  @Post('login')
  async login(
    @Body() body: { username?: string; password?: string },
    @Res() response: Response,
  ) {
    const { username, password } = body;
    if (!username || !password || username.length > 50 || password.length > 72) {
      return response
        .status(400)
        .json({ error: 'INVALID_INPUT', message: '用户名和密码不能为空' });
    }

    const user = await this.authService.findUserByUsernameWithHash(username);
    if (!user || !(await this.authService.verifyPassword(password, user.password_hash))) {
      return response.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const accessToken = this.authService.signAccessToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    const refreshToken = await this.authService.createRefreshToken(user.id);
    response.cookie('refresh_token', refreshToken, this.cookieOptions());
    return response.status(200).json({ accessToken, user: this.serializeUser(user) });
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res() response: Response) {
    const raw = this.readCookie(request, 'refresh_token');
    if (!raw) {
      return response.status(401).json({ error: 'TOKEN_MISSING' });
    }

    const result = await this.authService.rotateRefreshToken(raw);
    if ('error' in result) {
      this.clearRefreshCookie(response);
      return response.status(401).json({ error: result.error });
    }

    const accessToken = this.authService.signAccessToken({
      id: result.user.id,
      username: result.user.username,
      role: result.user.role,
    });
    response.cookie('refresh_token', result.newRaw, this.cookieOptions());
    return response.status(200).json({ accessToken });
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res() response: Response) {
    const authHeader = request.headers.authorization;
    const raw = this.readCookie(request, 'refresh_token');

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = this.authService.verifyAccessToken(token);
      if (payload) {
        await this.authService.revokeAllRefreshTokensForUser(payload.id);
      } else if (raw) {
        await this.authService.revokeRefreshToken(raw);
      }
    } else if (raw) {
      await this.authService.revokeRefreshToken(raw);
    } else {
      return response.status(400).json({ error: 'NO_SESSION' });
    }

    this.clearRefreshCookie(response);
    return response.status(200).json({ success: true });
  }

  @Get('me')
  async me(@Req() request: Request, @Res() response: Response) {
    const payload = this.requireAuth(request, response);
    if (!payload) {
      return;
    }

    const user = await this.authService.findUserById(payload.id);
    if (!user) {
      return response.status(401).json({ error: 'TOKEN_INVALID' });
    }

    return response.json(this.serializeUser(user));
  }

  @Get('users')
  async users(@Req() request: Request, @Res() response: Response) {
    const payload = this.requireAdmin(request, response);
    if (!payload) {
      return;
    }

    return response.json(await this.authService.getAllUsers());
  }

  @Post('users')
  async createUser(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: { username?: string; password?: string; role?: string },
  ) {
    const payload = this.requireAdmin(request, response);
    if (!payload) {
      return;
    }

    const { username, password, role = 'user' } = body;
    if (!username || !password || username.length > 50 || password.length > 72) {
      return response.status(400).json({ error: 'INVALID_INPUT' });
    }
    if (!['user', 'admin'].includes(role)) {
      return response.status(400).json({ error: 'INVALID_INPUT' });
    }

    try {
      const passwordHash = await this.authService.hashPassword(password);
      const user = await this.authService.createUser(username, passwordHash, role);
      return response.status(201).json(user);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        return response.status(409).json({ error: 'USERNAME_TAKEN' });
      }
      return response.status(500).json({ error: 'SERVER_ERROR' });
    }
  }

  @Patch('users/:id/role')
  async updateRole(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id') idParam: string,
    @Body() body: { role?: string },
  ) {
    const payload = this.requireAdmin(request, response);
    if (!payload) {
      return;
    }

    if (!['user', 'admin'].includes(body.role || '')) {
      return response.status(400).json({ error: 'INVALID_ROLE' });
    }

    const user = await this.authService.updateUserRole(Number(idParam), body.role || '');
    if (!user) {
      return response.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    return response.json(user);
  }

  @Delete('users/:id')
  async deleteUser(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id') idParam: string,
  ) {
    const payload = this.requireAdmin(request, response);
    if (!payload) {
      return;
    }

    const id = Number(idParam);
    if (id === payload.id) {
      return response.status(400).json({ error: 'CANNOT_DELETE_SELF' });
    }

    const deleted = await this.authService.deleteUser(id);
    if (deleted === 0) {
      return response.status(404).json({ error: 'USER_NOT_FOUND' });
    }
    return response.json({ success: true });
  }

  private requireAdmin(request: Request, response: Response) {
    const payload = this.requireAuth(request, response);
    if (!payload) {
      return null;
    }
    if (payload.role !== 'admin') {
      response.status(403).json({ error: 'FORBIDDEN' });
      return null;
    }
    return payload;
  }

  private requireAuth(request: Request, response: Response) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      response.status(401).json({ error: 'TOKEN_MISSING' });
      return null;
    }

    const payload = this.authService.verifyAccessToken(authHeader.slice(7));
    if (!payload) {
      response.status(401).json({ error: 'TOKEN_INVALID' });
      return null;
    }
    return payload;
  }

  private cookieOptions() {
    const maxAge =
      (Number.parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10) || 7) * 86400_000;
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      maxAge,
    };
  }

  private clearRefreshCookie(response: Response) {
    response.clearCookie('refresh_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  private readCookie(request: Request, name: string) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    const cookie = cookies.find((item) => item.startsWith(`${name}=`));
    if (!cookie) {
      return undefined;
    }
    return decodeURIComponent(cookie.slice(name.length + 1));
  }

  private serializeUser(user: PaperUserView) {
    return { id: user.id, username: user.username, role: user.role };
  }
}
