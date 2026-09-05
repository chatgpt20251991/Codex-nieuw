import { Body, ConflictException, Controller, Get, Param, Post } from '@nestjs/common';
import { EvidenceStorageService, EvidenceUploadSchema } from '../../common/storage/evidence-storage.service';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { invalidatePassports, lockValueOwner } from '../../common/tenant/passport-lock';
import { ExtractionService } from './extraction/extraction.service';

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly tenantDb:TenantDbService,private readonly evidenceStorage:EvidenceStorageService,private readonly extraction:ExtractionService){}

  @Post('upload-sessions')
  createUpload(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    return this.evidenceStorage.createUpload(orgId,actor.subject,EvidenceUploadSchema.parse(body));
  }

  @Post(':id/finalize')
  finalize(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){
    return this.evidenceStorage.finalize(orgId,id,actor.subject);
  }

  @Post(':id/verify')
  @Roles('operator_admin','compliance_manager','service_provider_admin')
  verify(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){
    return this.evidenceStorage.verify(orgId,id,actor.subject);
  }

  @Post('link')
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

  @Post(':id/extract')
  extract(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){return this.extraction.extractNow(orgId,id,actor.subject);}

  @Get(':id/extractions')
  listExtractions(@CurrentTenant() orgId:string,@Param('id') id:string){return this.tenantDb.run(orgId,tx=>tx.extractionJob.findMany({where:{organisationId:orgId,evidenceId:id},include:{claims:true},orderBy:{createdAt:'desc'}}));}
}
