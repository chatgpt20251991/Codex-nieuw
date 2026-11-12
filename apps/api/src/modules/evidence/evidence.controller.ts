import { Body, ConflictException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { EvidenceStorageService, EvidenceUploadSchema } from '../../common/storage/evidence-storage.service';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { RequireAuthorisationScope } from '../../common/tenant/authorisation-scope.decorator';
import { invalidatePassports, lockValueOwner } from '../../common/tenant/passport-lock';
import { ExtractionService } from './extraction/extraction.service';
import { currentAuthorisationEvidence } from '../authorisations/authorisation-evidence';

const InventoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100), cursor: z.string().uuid().optional(),
}).strict();

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly tenantDb:TenantDbService,private readonly evidenceStorage:EvidenceStorageService,private readonly extraction:ExtractionService){}

  @RequireAuthorisationScope('evidenceRead') @Get()
  async list(@CurrentTenant() orgId:string,@Query() query:unknown = {}) {
    const { limit, cursor } = InventoryQuery.parse(query);
    return this.tenantDb.run(orgId, async tx => {
      if (cursor) await tx.evidenceObject.findFirstOrThrow({
        where: { id: cursor, organisationId: orgId }, select: { id: true },
      });
      const rows = await tx.evidenceObject.findMany({ where: { organisationId: orgId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const now = Date.now();
      // Attestation fields are needed internally for eligibility. Never return
      // storage locators, hashes, signed URLs or scanner internals in this list.
      return rows.map(row => ({ id: row.id, originalFilename: row.originalFilename,
        mimeType: row.mimeType, sizeBytes: row.sizeBytes?.toString() ?? null,
        verificationStatus: row.verificationStatus, uploadedAt: row.uploadedAt,
        // The legacy schema has no independent verification timestamp.
        verifiedAt: null, expiresAt: row.expiresAt, issuedAt: row.issuedAt,
        eligibleForAuthorisation: currentAuthorisationEvidence(row, orgId, row.id, now),
      }));
    });
  }

  @RequireAuthorisationScope('evidenceWrite') @Post('upload-sessions')
  createUpload(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    return this.evidenceStorage.createUpload(orgId,actor.subject,EvidenceUploadSchema.parse(body));
  }

  @RequireAuthorisationScope('evidenceWrite') @Post(':id/finalize')
  finalize(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){
    return this.evidenceStorage.finalize(orgId,id,actor.subject);
  }

  @RequireAuthorisationScope('evidenceReview') @Post(':id/verify')
  @Roles('operator_admin','compliance_manager','service_provider_admin')
  verify(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){
    return this.evidenceStorage.verify(orgId,id,actor.subject);
  }

  @Post(':id/review-download')
  @Roles('operator_admin','compliance_manager','service_provider_admin')
  @RequireAuthorisationScope('evidenceReview')
  reviewDownload(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){
    return this.evidenceStorage.reviewDownload(orgId,id,actor.subject);
  }

  @RequireAuthorisationScope('evidenceWrite') @Post('link')
  async link(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() b:any){
    return this.tenantDb.run(orgId,async tx=>{
      await tx.evidenceObject.findFirstOrThrow({where:{id:b.evidenceId,organisationId:orgId}});
      const value=await tx.passportValue.findFirstOrThrow({where:{id:b.passportValueId,organisationId:orgId}});
      await lockValueOwner(tx,orgId,value);
      await tx.$queryRaw`SELECT "id" FROM "EvidenceObject" WHERE "id" = ${b.evidenceId} AND "organisationId" = ${orgId} FOR UPDATE`;
      const evidence=await tx.evidenceObject.findFirstOrThrow({where:{id:b.evidenceId,organisationId:orgId}});
      if(['rejected','superseded'].includes(evidence.verificationStatus))throw new ConflictException({code:'EVIDENCE_NOT_READY'});
      const row=await tx.evidenceLink.upsert({where:{evidenceId_passportValueId:{evidenceId:b.evidenceId,passportValueId:b.passportValueId}},
        create:{evidenceId:b.evidenceId,passportValueId:b.passportValueId,relationship:b.relationship||'supports',locatorJson:b.locatorJson},
        update:{relationship:b.relationship||'supports',locatorJson:b.locatorJson}});
      await invalidatePassports(tx,orgId,value);
      await tx.auditEvent.create({data:{organisationId:orgId,actorSubject:actor.subject,action:'evidence.link',resourceType:'passport_value',resourceId:b.passportValueId,metadata:{evidenceId:b.evidenceId}}});
      return row;
    });
  }

  @RequireAuthorisationScope('evidenceExtract') @Post(':id/extract')
  extract(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){return this.extraction.extractNow(orgId,id,actor.subject);}

  @RequireAuthorisationScope('evidenceRead') @Get(':id/extractions')
  listExtractions(@CurrentTenant() orgId:string,@Param('id') id:string){return this.tenantDb.run(orgId,tx=>tx.extractionJob.findMany({where:{organisationId:orgId,evidenceId:id},include:{claims:true},orderBy:{createdAt:'desc'}}));}
}
