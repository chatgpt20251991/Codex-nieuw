import { Body, ConflictException, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { registryGate } from '@eubp/rules';
import { RegistryIdentityService } from './registry-identity.service';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { PassportDataService } from '../passports/passport-data.service';
import { RegistryPreparationService } from './registry-preparation.service';

@Controller('registry')
export class RegistryController {
  constructor(private readonly passportData: PassportDataService, private readonly registryIdentity: RegistryIdentityService,
    private readonly preparation: RegistryPreparationService) {}

  @Get('items/:itemId/gate')
  async gate(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('itemId') itemId: string) {
    const validation = await this.passportData.validate(orgId, z.string().uuid().parse(itemId));
    const complianceGate = registryGate({
      batterySemanticCatalogueAvailable: process.env.BATTERY_SEMANTIC_CATALOGUE_AVAILABLE === 'true',
      batteryRegistrationAvailable: process.env.REGISTRY_BATTERY_SUBMISSION_AVAILABLE === 'true',
    }, validation.publicationBlockers.length);
    const actorGate = await this.registryIdentity.gate(orgId, actor);
    return { allowed: false, code: 'LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED', complianceGate, actorGate };
  }

  @Post('export-json')
  exportJson(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.preparation.prepare(orgId, actor, body, 'json');
  }

  @Post('export-xml')
  exportXml(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.preparation.prepare(orgId, actor, body, 'xml');
  }

  @Get('exports/:correlationId')
  exported(@CurrentTenant() orgId: string, @Param('correlationId') correlationId: string) {
    return this.preparation.get(orgId, z.string().uuid().parse(correlationId));
  }

  @Post('items/:itemId/prepare')
  prepare(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('itemId') itemId: string, @Body() body: unknown) {
    z.object({}).strict().parse(body);
    return this.preparation.prepare(orgId, actor, { itemIds: [itemId] }, 'json', 'registry.prepare');
  }

  @Post('items/:itemId/submit')
  async submit(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('itemId') itemId: string, @Body() body: unknown) {
    z.object({}).strict().parse(body);
    const result = await this.preparation.prepare(orgId, actor, { itemIds: [itemId] }, 'json', 'registry.submit_blocked');
    throw new ConflictException({ code: 'LIVE_REGISTRY_ADAPTER_NOT_CONFIGURED', correlationId: result.correlationId,
      result: result.result, message: 'The local blocked outcome was recorded. No live Registry request was sent.' });
  }
}
