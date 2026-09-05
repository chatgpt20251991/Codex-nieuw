import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    // Bound work before parsing. Keep whitespace and credential parsing separate
    // so long whitespace-only headers cannot cause regex backtracking.
    if (typeof header !== 'string' || header.length > 16400 ||
        header.slice(0, 6).toLowerCase() !== 'bearer' || ![' ', '\t'].includes(header[6])) {
      throw new UnauthorizedException({ code: 'BEARER_REQUIRED', message: 'Bearer access token required.' });
    }
    const token = header.slice(7).trim();
    if (!token || /\s/.test(token)) throw new UnauthorizedException({ code: 'BEARER_REQUIRED', message: 'Bearer access token required.' });
    req.actor = await this.auth.verifyBearer(token);
    return true;
  }
}
