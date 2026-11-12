import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { RequireAuthorisationScope } from '../../common/tenant/authorisation-scope.decorator';
import { PassportExportService } from './passport-export.service';

@Controller('passports')
export class PassportExportController {
  constructor(private readonly exports: PassportExportService) {}

  @Get(':itemId/operator-export')
  @Roles('operator_admin', 'compliance_manager', 'service_provider_admin')
  @RequireAuthorisationScope('passportExport')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Content-Disposition', 'attachment; filename="private-operator-passport-export.json"')
  @Header('X-Content-Type-Options', 'nosniff')
  export(@CurrentTenant() organisationId: string, @CurrentActor() actor: Actor,
    @Param('itemId', new ParseUUIDPipe()) itemId: string) {
    return this.exports.export(organisationId, itemId, actor.subject);
  }
}
