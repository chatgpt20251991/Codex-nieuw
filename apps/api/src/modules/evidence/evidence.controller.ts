import { Body, ConflictException, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { ExtractionService } from './extraction/extraction.service';

const UploadSchema=z.object({originalFilename:z.string().min(1).max(240),mimeType:z.string().min(1).max(120),sizeBytes:z.number().int().positive().max(100*1024*1024),sha256:z.string().regex(/^[a-fA-F0-9]{64}$/),evidenceType:z.string().min(1).max(80),supplierId:z.string().uuid().optional()});

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly tenantDb:TenantDbService,private readonly storage:StorageService,private readonly audit:AuditService,private readonly extraction:ExtractionService){}

  @Post('upload-sessions')
  async createUpload(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=UploadSchema.parse(body);
    const draft=await this.tenantDb.run(orgId,async tx=>{if(b.supplierId)await tx.supplier.findFirstOrThrow({where:{id:b.supplierId,organisationId:orgId}});return tx.evidenceObject.create({data:{organisationId:orgId,supplierId:b.supplierId,objectKey:'pending',originalFilename:b.originalFilename,mimeType:b.mimeType,sizeBytes:BigInt(b.sizeBytes),sha256:b.sha256.toLowerCase(),evidenceType:b.evidenceType,verificationStatus:'pending_upload'}})});
    const objectKey=this.storage.evidenceKey(orgId,draft.id,b.originalFilename);
    await this.tenantDb.run(orgId,tx=>tx.evidenceObject.update({where:{id:draft.id},data:{objectKey}}));
    const signed=await this.storage.createUploadUrl({objectKey,mimeType:b.mimeType,sizeBytes:b.sizeBytes,sha256:b.sha256.toLowerCase()});
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'evidence.upload_session',resourceType:'evidence',resourceId:draft.id});
    return {evidenceId:draft.id,objectKey,uploadUrl:signed.url,method:'PUT',requiredHeaders:{'content-type':b.mimeType,'x-amz-meta-sha256':b.sha256.toLowerCase(),'x-amz-checksum-sha256':signed.checksumBase64},expiresInSeconds:signed.expiresIn};
  }

  @Post(':id/finalize')
  async finalize(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){
    const evidence=await this.tenantDb.run(orgId,tx=>tx.evidenceObject.findFirstOrThrow({where:{id,organisationId:orgId}}));
    const verify=await this.storage.verifyObjectSha256(evidence.objectKey,evidence.sha256||''); const head=verify.head; const size=head.ContentLength!==undefined?Number(head.ContentLength):undefined;
    if(evidence.sizeBytes!==null&&size!==Number(evidence.sizeBytes))throw new ConflictException({code:'UPLOAD_SIZE_MISMATCH',expected:Number(evidence.sizeBytes),actual:size});
    if(!verify.ok)throw new ConflictException({code:'UPLOAD_CONTENT_HASH_MISMATCH',message:'Stored object bytes do not match the declared SHA-256.',actual:verify.actualHex});
    const row=await this.tenantDb.run(orgId,tx=>tx.evidenceObject.update({where:{id},data:{verificationStatus:'uploaded',uploadedAt:new Date(),storageChecksum:head.ChecksumSHA256||undefined}}));
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'evidence.finalize',resourceType:'evidence',resourceId:id,metadata:{size}});return row;
  }

  @Post(':id/verify')
  @Roles('operator_admin','compliance_manager','service_provider_admin')
  async verify(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){const row=await this.tenantDb.run(orgId,async tx=>{const e=await tx.evidenceObject.findFirstOrThrow({where:{id,organisationId:orgId}});if(!['uploaded','unverified'].includes(e.verificationStatus))throw new ConflictException({code:'EVIDENCE_NOT_READY'});return tx.evidenceObject.update({where:{id},data:{verificationStatus:'verified'}})});await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'evidence.verify',resourceType:'evidence',resourceId:id});return row;}

  @Post('link')
  async link(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() b:any){const row=await this.tenantDb.run(orgId,async tx=>{await tx.evidenceObject.findFirstOrThrow({where:{id:b.evidenceId,organisationId:orgId}});await tx.passportValue.findFirstOrThrow({where:{id:b.passportValueId,organisationId:orgId}});return tx.evidenceLink.upsert({where:{evidenceId_passportValueId:{evidenceId:b.evidenceId,passportValueId:b.passportValueId}},create:{evidenceId:b.evidenceId,passportValueId:b.passportValueId,relationship:b.relationship||'supports',locatorJson:b.locatorJson},update:{relationship:b.relationship||'supports',locatorJson:b.locatorJson}})});await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'evidence.link',resourceType:'passport_value',resourceId:b.passportValueId,metadata:{evidenceId:b.evidenceId}});return row;}

  @Post(':id/extract')
  extract(@CurrentTenant() orgId:string,@Param('id') id:string){return this.extraction.extractNow(orgId,id);}

  @Get(':id/extractions')
  listExtractions(@CurrentTenant() orgId:string,@Param('id') id:string){return this.tenantDb.run(orgId,tx=>tx.extractionJob.findMany({where:{organisationId:orgId,evidenceId:id},include:{claims:true},orderBy:{createdAt:'desc'}}));}
}
