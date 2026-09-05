import { Prisma } from '@prisma/client';
import { Body, ConflictException, Controller, Get, GoneException, Headers, Param, Post } from '@nestjs/common';
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
import { invalidatePassports, lockModel } from '../../common/tenant/passport-lock';
import { SupplierTokenService } from './supplier-token.service';

const SupplierSchema=z.object({legalName:z.string().min(2),countryCode:z.string().length(2).optional(),externalReference:z.string().optional(),contact:z.object({name:z.string().optional(),email:z.string().email(),phone:z.string().optional()}).optional()});
const RequestSchema=z.object({supplierId:z.string().uuid(),modelId:z.string().uuid(),fieldDefinitionIds:z.array(z.number().int().min(1).max(71)).min(1).max(71),message:z.string().max(4000).optional(),dueAt:z.string().datetime().optional(),expiresInDays:z.number().int().min(1).max(90).default(30)});
const SubmissionSchema=z.object({submissions:z.array(z.object({fieldDefinitionId:z.number().int().min(1).max(71),value:z.any(),unit:z.string().max(40).optional(),attestationText:z.string().max(4000).optional(),evidenceIds:z.array(z.string().uuid()).max(20).optional()})).min(1).max(71)});
const SupplierUploadSchema=EvidenceUploadSchema.omit({supplierId:true});

@Controller()
export class SuppliersController {
  constructor(private readonly tenantDb:TenantDbService,private readonly config:ConfigService,private readonly evidenceStorage:EvidenceStorageService,private readonly audit:AuditService,private readonly tokens:SupplierTokenService){}

  private assertOpen(request: { expiresAt: Date; status: string }) {
    if (request.expiresAt.getTime() <= Date.now()) throw new GoneException({ code: 'SUPPLIER_TOKEN_EXPIRED' });
    if (['accepted', 'cancelled', 'expired'].includes(request.status)) {
      throw new GoneException({ code: 'SUPPLIER_REQUEST_CLOSED', status: request.status });
    }
  }

  private async lockRequest(tx: Prisma.TransactionClient, organisationId: string, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "SupplierRequest" WHERE "id" = ${id} AND "organisationId" = ${organisationId} FOR UPDATE`;
    const request = await tx.supplierRequest.findFirstOrThrow({ where: { id, organisationId },
      include: { supplier: true, model: true, fields: true,
        submissions: { include: { evidence: true }, orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }] } } });
    this.assertOpen(request);
    return request;
  }

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
  async portalSession(@Headers('x-supplier-token') token: string) {
    const context = await this.tokens.resolve(token);
    return this.tenantDb.run(context.organisationId, async tx => {
      const request = await this.lockRequest(tx, context.organisationId, context.request.id);
      if (!request.openedAt) {
        const now = new Date();
        const changed = await tx.supplierRequest.updateMany({ where: { id: request.id,
          organisationId: context.organisationId, openedAt: null, status: request.status, expiresAt: { gt: now } },
          data: { openedAt: now, ...(request.status === 'sent' ? { status: 'opened' } : {}) } });
        if (changed.count !== 1) throw new GoneException({ code: 'SUPPLIER_TOKEN_EXPIRED' });
      }
      return { requestId: request.id, supplier: { legalName: request.supplier.legalName },
        batteryModel: { modelIdentifier: request.model.modelIdentifier, name: request.model.name, category: request.model.category },
        requestedFields: request.fields.map(field => ({ fieldDefinitionId: field.fieldDefinitionId,
          name: ruleFields.find(definition => definition.id === field.fieldDefinitionId)?.name || `Data point ${field.fieldDefinitionId}`,
          legalSource: ruleFields.find(definition => definition.id === field.fieldDefinitionId)?.legal_source })),
        message: request.message, dueAt: request.dueAt, expiresAt: request.expiresAt,
        existingSubmissions: request.submissions.map(submission => ({ fieldDefinitionId: submission.fieldDefinitionId,
          value: submission.valueJson, unit: submission.unit })) };
    });
  }

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
  async submit(@Headers('x-supplier-token') token: string, @Body() body: unknown) {
    const input = SubmissionSchema.parse(body), context = await this.tokens.resolve(token);
    await this.tenantDb.run(context.organisationId, async tx => {
      // Resolving a capability before the transaction is not a lock: acceptance
      // may have closed the request in the meantime.
      const request = await this.lockRequest(tx, context.organisationId, context.request.id);
      const requested = new Set(request.fields.map(field => field.fieldDefinitionId));
      for (const submission of input.submissions) {
        if (!requested.has(submission.fieldDefinitionId)) throw new ConflictException({
          code: 'FIELD_NOT_REQUESTED', fieldDefinitionId: submission.fieldDefinitionId });
        const row = await tx.supplierSubmission.create({ data: { supplierRequestId: request.id,
          fieldDefinitionId: submission.fieldDefinitionId,
          valueJson: submission.value === null ? Prisma.JsonNull : submission.value,
          unit: submission.unit, attestationText: submission.attestationText } });
        for (const evidenceId of submission.evidenceIds || []) {
          await tx.evidenceObject.findFirstOrThrow({ where: { id: evidenceId,
            organisationId: context.organisationId, supplierId: request.supplierId } });
          await tx.supplierSubmissionEvidence.create({ data: { supplierSubmissionId: row.id, evidenceId } });
        }
      }
      this.assertOpen(request);
      await tx.supplierRequest.update({ where: { id: request.id }, data: { status: 'submitted', submittedAt: new Date() } });
    });
    return { ok: true, status: 'submitted',
      notice: 'Supplier data remains unvalidated until the responsible operator/service provider reviews and accepts it.' };
  }

  @Post('supplier-requests/:id/accept')
  async accept(@CurrentTenant() orgId: string, @CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.tenantDb.run(orgId, async tx => {
      const candidate = await tx.supplierRequest.findFirstOrThrow({ where: { id, organisationId: orgId }, select: { modelId: true } });
      // Preserve the model-before-evidence lock order used by publication and
      // malware rejection; serialize request decisions between those locks.
      await lockModel(tx, orgId, candidate.modelId);
      const request = await this.lockRequest(tx, orgId, id);
      if (request.modelId !== candidate.modelId) throw new ConflictException({ code: 'SUPPLIER_REQUEST_CHANGED_RETRY' });
      if (!request.submissions.length) throw new ConflictException({ code: 'NO_SUBMISSIONS' });
      const evidenceIds = [...new Set(request.submissions.flatMap(submission => submission.evidence.map(link => link.evidenceId)))].sort();
      for (const evidenceId of evidenceIds) {
        await tx.$queryRaw`SELECT "id" FROM "EvidenceObject" WHERE "id" = ${evidenceId} AND "organisationId" = ${orgId} FOR UPDATE`;
        const evidence = await tx.evidenceObject.findFirstOrThrow({ where: { id: evidenceId, organisationId: orgId } });
        if (['rejected', 'superseded'].includes(evidence.verificationStatus)) throw new ConflictException({ code: 'EVIDENCE_NOT_READY' });
      }
      let count = 0;
      for (const submission of request.submissions) {
        const prior = await tx.passportValue.findFirst({ where: { organisationId: orgId, modelId: request.modelId,
          batteryItemId: null, fieldDefinitionId: submission.fieldDefinitionId, validUntil: null } });
        if (prior) await tx.passportValue.update({ where: { id: prior.id }, data: { validUntil: new Date(), validationStatus: 'superseded' } });
        const value = await tx.passportValue.create({ data: { organisationId: orgId, modelId: request.modelId,
          fieldDefinitionId: submission.fieldDefinitionId, valueJson: submission.valueJson === null ? Prisma.JsonNull : submission.valueJson,
          unit: submission.unit, sourceKind: 'supplier', validationStatus: 'submitted', supersedesValueId: prior?.id } });
        for (const link of submission.evidence) await tx.evidenceLink.create({ data: { evidenceId: link.evidenceId,
          passportValueId: value.id, relationship: 'supports' } });
        count++;
      }
      this.assertOpen(request);
      await tx.supplierRequest.update({ where: { id }, data: { status: 'accepted' } });
      await invalidatePassports(tx, orgId, { modelId: request.modelId });
      const result = { acceptedValues: count };
      await tx.auditEvent.create({ data: { organisationId: orgId, actorSubject: actor.subject,
        action: 'supplier_request.accept', resourceType: 'supplier_request', resourceId: id, metadata: result } });
      return result;
    });
  }
}
