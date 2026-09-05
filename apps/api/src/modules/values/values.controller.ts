import { Prisma } from '@prisma/client';
import { Body, ConflictException, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { AuditService } from '../audit/audit.service';

const ValueSchema=z.object({
  modelId:z.string().uuid().optional(), batteryItemId:z.string().uuid().optional(), fieldDefinitionId:z.number().int().min(1).max(71),
  value:z.any(), unit:z.string().max(40).optional(), sourceKind:z.enum(['operator','supplier','system','integration']).optional()
}).refine(x=>Boolean(x.modelId)!==Boolean(x.batteryItemId),{message:'Exactly one of modelId or batteryItemId is required.'});

@Controller('passport-values')
export class ValuesController {
  constructor(private readonly tenantDb:TenantDbService,private readonly audit:AuditService){}

  @Post()
  async create(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=ValueSchema.parse(body);
    const row=await this.tenantDb.run(orgId,async tx=>{
      if(b.modelId) await tx.batteryModel.findFirstOrThrow({where:{id:b.modelId,organisationId:orgId}});
      if(b.batteryItemId) await tx.batteryItem.findFirstOrThrow({where:{id:b.batteryItemId,organisationId:orgId}});
      const prior=await tx.passportValue.findFirst({where:{organisationId:orgId,modelId:b.modelId||null,batteryItemId:b.batteryItemId||null,fieldDefinitionId:b.fieldDefinitionId,validUntil:null},orderBy:{createdAt:'desc'}});
      if(prior) await tx.passportValue.update({where:{id:prior.id},data:{validUntil:new Date(),validationStatus:'superseded'}});
      const created=await tx.passportValue.create({data:{organisationId:orgId,modelId:b.modelId,batteryItemId:b.batteryItemId,fieldDefinitionId:b.fieldDefinitionId,valueJson:b.value === null ? Prisma.JsonNull : b.value,unit:b.unit,sourceKind:b.sourceKind||'operator',supersedesValueId:prior?.id}});
      if(b.batteryItemId) await tx.batteryItem.updateMany({where:{id:b.batteryItemId,organisationId:orgId,passportState:{in:['published','registered','registry_pending']}},data:{passportState:'updated'}});
      if(b.modelId) await tx.batteryItem.updateMany({where:{modelId:b.modelId,organisationId:orgId,passportState:{in:['published','registered','registry_pending']}},data:{passportState:'updated'}});
      return created;
    });
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'passport_value.create',resourceType:'passport_value',resourceId:row.id,metadata:{fieldDefinitionId:row.fieldDefinitionId}}); return row;
  }

  @Get(':id')
  get(@CurrentTenant() orgId:string,@Param('id') id:string){return this.tenantDb.run(orgId,tx=>tx.passportValue.findFirstOrThrow({where:{id,organisationId:orgId},include:{evidenceLinks:{include:{evidence:true}}}}));}

  @Post(':id/validate')
  async validate(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string){
    const row=await this.tenantDb.run(orgId,async tx=>{
      const value=await tx.passportValue.findFirstOrThrow({where:{id,organisationId:orgId},include:{evidenceLinks:{include:{evidence:true}}}});
      const usable=value.evidenceLinks.filter(l=>l.evidence.verificationStatus==='verified');
      if(!usable.length) throw new ConflictException({code:'PROVENANCE_REQUIRED',message:'At least one verified evidence/provenance object is required before value validation.'});
      return tx.passportValue.update({where:{id},data:{validationStatus:'validated'}});
    });
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'passport_value.validate',resourceType:'passport_value',resourceId:id}); return {ok:true,value:row};
  }

  @Post(':id/reject')
  async reject(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Param('id') id:string,@Body() body:any){
    const row=await this.tenantDb.run(orgId,async tx=>{await tx.passportValue.findFirstOrThrow({where:{id,organisationId:orgId}});return tx.passportValue.update({where:{id},data:{validationStatus:'rejected',validUntil:new Date()}})});
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'passport_value.reject',resourceType:'passport_value',resourceId:id,metadata:{reason:String(body?.reason||'')}});return row;
  }
}
