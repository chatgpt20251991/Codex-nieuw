import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { assertRuntimeDatabaseSecurity, RUNTIME_DATABASE_SECURITY_ERROR } from './runtime-database-security';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    if (process.env.NODE_ENV !== 'production') {
      await this.$connect();
      return;
    }
    try {
      await this.$connect();
      await assertRuntimeDatabaseSecurity(this);
    } catch {
      try { await this.$disconnect(); } catch { /* Keep startup failures generic. */ }
      throw new Error(RUNTIME_DATABASE_SECURITY_ERROR);
    }
  }
}
