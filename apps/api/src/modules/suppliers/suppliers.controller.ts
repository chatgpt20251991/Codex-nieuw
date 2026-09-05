import { Prisma } from '@prisma/client';
import { Body, ConflictException, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fields as ruleFields } from '@eubp/rules';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { Public } from '../../common/auth/public.decorator';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { secureToken, sha256Hex } from '../../common/crypto/canonical';
import { EvidenceStorageService, EvidenceUploadSchema } from '../../common/storage/evidence-storage.service';
import { AuditService } from '../audit/audit.service';
import { SupplierTokenService } from './supplier-token.service';

const SupplierSchema=z.object({legalName:z.string().min(2),countryCode:z.string().length(2).optional(),externalReference:z.string().optional(),contact:z.object({name:z.string().optional(),email:z.string().email(),phone:z.string().optional()}).optional()});
const RequestSchema=z.object({supplierId:z.string().uuid(),modelId:z.string().uuid(),fieldDefinitionIds:z.array(z.number().int().min(1).max(71)).min(1).max(71),message:z.string().max(4000).optional(),dueAt:z.string().datetime().optional(),expiresInDays:z.number().int().min(1).max(90).default(30)});
const SubmissionSchema=z.object({submissions:z.array(z.object({fieldDefinitionId:z.number().int().min(1).max(71),value:z.any(),unit:z.string().max(40).optional(),attestationText:z.string().max(4000).optional(),evidenceIds:z.array(z.string().uuid()).max(20).optional()})).min(1).max(71)});
const SupplierUploadSchema=EvidenceUploadSchema.omit({supplierId:true});

@Controller()
export class SuppliersController {
  constructor(private readonly tenantDb:TenantDbService,private readonly config:ConfigService,private readonly evidenceStorage:EvidenceStorageService,private readonly audit:AuditService,private readonly tokens:SupplierTokenService){}

  @Get('suppliers') list(@CurrentTenant() orgId:string){return this.tenantDb.run(orgId,tx=>tx.supplier.findMany({where:{organisationId:orgId},include:{contacts:true,_count:{select:{requests:true,evidence:true}}},orderBy:{createdAt:'desc'}}));}

  @Post('suppliers') async create(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){const b=SupplierSchema.parse(body);const row=await this.tenantDb.run(orgId,async tx=>{const supplier=await tx.supplier.create({data:{organisationId:orgId,legalName:b.legalName,countryCode:b.countryCode?.toUpperCase(),externalReference:b.externalReference}});if(b.contact)await tx.supplierContact.create({data:{supplierId:supplier.id,...b.contact}});return supplier;});await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'supplier.create',resourceType:'supplier',resourceId:row.id});return row;}

  @Post('supplier-requests') async createRequest(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=RequestSchema.parse(body);const raw=secureToken();const hash=sha256Hex(raw);const expiresAt=new Date(Date.now()+b.expiresInDays*86400000);
    const row=await this.tenantDb.run(orgId,async tx=>{await tx.supplier.findFirstOrThrow({where:{id:b.supplierId,organisationId:orgId}});await tx.batteryModel.findFirstOrThrow({where:{id:b.modelId,organisationId:orgId}});return tx.supplierRequest.create({data:{organisationId:orgId,supplierId:b.supplierId,modelId:b.modelId,tokenHash:hash,status:'sent',requestedBySubject:actor.subject,message:b.message,dueAt:b.dueAt?new Date(b.dueAt):undefined,expiresAt,sentAt:new Date(),fields:{create:[...new Set(b.fieldDefinitionIds)].map(fieldDefinitionId=>({fieldDefinitionId}))}},include:{supplier:true,model:true,fields:true}})});
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'supplier_request.create',resourceType:'supplier_request',resourceId:row.id,metadata:{fieldCount:row.fields.length}});
    const base=this.config.get<string>('SUPPLIER_PORTAL_BASE_URL')||'http://localhost:3000/supplier';return {request:row,inviteUrl:`${base}#token=${encodeURIComponent(raw)}`,securityNotice:'The raw capability token is shown once. The portal should move it from the URL fragment into memory/session storage and send it only in X-Supplier-Token.'};
  }

  @Get('supplier-requests') listRequests(@CurrentTenant() orgId:string){return this.tenantDb.run(orgId,tx=>tx.supplierRequest.findMany({where:{organisationId:orgId},include:{supplier:true,model:true,fields:true,_count:{select:{submissions:true}}},orderBy:{createdAt:'desc'}}));}

  @Public() @Get('supplier-portal/session')
  async portalSession(@Headers('x-supplier-token') token:string){const x=await this.tokens.resolve(token);if(!x.request.openedAt)await this.tenantDb.run(x.organisationId,tx=>tx.supplierRequest.update({where:{id:x.request.id},data:{openedAt:new Date(),status:'opened'}}));return {requestId:x.request.id,supplier:{legalName:x.request.supplier.legalName},batteryModel:{modelIdentifier:x.request.model.modelIdentifier,name:x.request.model.name,category:x.request.model.category},requestedFields:x.request.fields.map(f=>({fieldDefinitionId:f.fieldDefinitionId,name:ruleFields.find(d=>d.id===f.fieldDefinitionId)?.name||`Data point ${f.fieldDefinitionId}`,legalSource:ruleFields.find(d=>d.id===f.fieldDefinitionId)?.legal_source})),message:x.request.message,dueAt:x.request.dueAt,expiresAt:x.request.expiresAt,existingSubmissions:x.request.submissions.map(s=>({fieldDefinitionId:s.fieldDefinitionId,value:s.valueJson,unit:s.unit}))};}

  @Public() @Post('supplier-portal/evidence/upload-session')
  async supplierUpload(@Headers('x-supplier-token') token:string,@Body() body:unknown){
    const b=SupplierUploadSchema.parse(body);const x=await this.tokens.resolve(token);
    return this.evidenceStorage.createUpload(x.organisationId,`supplier-request:${x.request.id}`,{...b,supplierId:x.request.supplierId});
  }

  @Public() @Post('supplier-portal/evidence/:id/finalize')
  async supplierFinalize(@Headers('x-supplier-token') token:string,@Param('id') id:string){
    const x=await this.tokens.resolve(token);
    return this.evidenceStorage.finalize(x.organisationId,id,`supplier-request:${x.request.id}`,x.request.supplierId);
  }

  @Public() @Post('supplier-portal/submissions')
  async submit(@Headers('x-supplier-token') token:string,@Body() body:unknown){const b=SubmissionSchema.parse(body);const x=await this.tokens.resolve(token);const requested=new Set(x.request.fields.map(f=>f.fieldDefinitionId));for(const s of b.submissions)if(!requested.has(s.fieldDefinitionId))throw new ConflictException({code:'FIELD_NOT_REQUESTED',fieldDefinitionId:s.fieldDefinitionId});await this.tenantDb.run(x.organisationId,async tx=>{for(const s of b.submissions){const row=await tx.supplierSubmission.create({data:{supplierRequestId:x.request.id,fieldDefinitionId:s.fieldDefinitionId,valueJson:s.value === null ? Prisma.JsonNull : s.value,unit:s.unit,attestationText:s.attestationText}});for(const evidenceId of s.evidenceIds||[]){await tx.evidenceObject.findFirstOrThrow({where:{id:evidenceId,organisationId:x.organisationId,supplierId:x.request.supplierId}});await tx.supplierSubmissionEvidence.create({data:{supplierSubmissionId:row.id,evidenceId}});}}await tx.supplierRequest.update({where:{id:x.request.id},data:{status:'submitted',submittedAt:new Date()}});});return {ok:true,status:'submitted',notice:'Supplier data remains unvalidated until the responsible operator/service provider reviews and accepts it.'};}

  @Post('supplier-requests/:id/accept')
  async accept(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){const result=await this.tenantDb.run(orgId,async tx=>{const r=await tx.supplierRequest.findFirstOrThrow({where:{id,organisationId:orgId},include:{submissions:{include:{evidence:true}}}});if(!r.submissions.length)throw new ConflictException({code:'NO_SUBMISSIONS'});let count=0;for(const s of r.submissions){const prior=await tx.passportValue.findFirst({where:{organisationId:orgId,modelId:r.modelId,batteryItemId:null,fieldDefinitionId:s.fieldDefinitionId,validUntil:null}});if(prior)await tx.passportValue.update({where:{id:prior.id},data:{validUntil:new Date(),validationStatus:'superseded'}});const v=await tx.passportValue.create({data:{organisationId:orgId,modelId:r.modelId,fieldDefinitionId:s.fieldDefinitionId,valueJson:s.valueJson === null ? Prisma.JsonNull : s.valueJson,unit:s.unit,sourceKind:'supplier',validationStatus:'submitted',supersedesValueId:prior?.id}});for(const e of s.evidence)await tx.evidenceLink.create({data:{evidenceId:e.evidenceId,passportValueId:v.id,relationship:'supports'}});count++;}await tx.supplierRequest.update({where:{id},data:{status:'accepted'}});await tx.batteryItem.updateMany({where:{organisationId:orgId,modelId:r.modelId,passportState:{in:['published','registered','registry_pending']}},data:{passportState:'updated'}});return {acceptedValues:count};});await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'supplier_request.accept',resourceType:'supplier_request',resourceId:id,metadata:result});return result;}
}
