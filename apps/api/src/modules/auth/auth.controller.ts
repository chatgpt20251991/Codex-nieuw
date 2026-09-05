import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../../common/auth/auth.service';
import { Public } from '../../common/auth/public.decorator';
import { ACTOR_ROLES } from '../../common/auth/auth-config';

const DevTokenSchema = z.object({
  subject: z.string().min(1).max(255).refine(value => value.trim() === value),
  organisationId: z.string().uuid(),
  role: z.enum(ACTOR_ROLES).optional(),
  email: z.string().email().optional(),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('dev-token')
  async devToken(@Body() body: unknown) {
    const input = DevTokenSchema.parse(body);
    return { accessToken: await this.auth.createDevToken(input), tokenType: 'Bearer', expiresIn: 28800 };
  }
}
