import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    // Missing and RLS-hidden resources have the same public response.
    const status = error.code === 'P2025' ? 404 : error.code === 'P2002' ? 409 : 500;
    const code = status === 404 ? 'RESOURCE_NOT_FOUND' : status === 409 ? 'RESOURCE_CONFLICT' : 'DATABASE_ERROR';
    host.switchToHttp().getResponse().status(status).json({ statusCode: status, code });
  }
}