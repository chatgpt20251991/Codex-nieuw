import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { AuditService } from '../audit/audit.service';

const ModelSchema=z.object({modelIdentifier:z.string().min(1),category:z.enum(['EV','LMT','INDUSTRIAL_GT_2KWH']),name:z.string().optional(),chemistry:z.string().optional(),applicabilityContext:z.record(z.string(),z.any()).optional()});
const ItemSchema=z.object({modelId:z.string().uuid(),serialOrItemIdentifier:z.string().min(1),batchIdentifier:z.string().optional(),upi:z.string().url().optional(),manufactureDate:z.string().datetime().or(z.string().date()).optional()});
const BulkSchema=z.object({items:z.array(ItemSchema).min(1).max(1000)});

@Controller()
export class BatteriesController {
  constructor(private readonly tenantDb:TenantDbService,private readonly audit:AuditService){}

  @Get('battery-models')
  list(@CurrentTenant() orgId:string){return this.tenantDb.run(orgId,tx=>tx.batteryModel.findMany({where:{organisationId:orgId},include:{_count:{select:{items:true}}},orderBy:{createdAt:'desc'}}));}

  @Post('battery-models')
  async createModel(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=ModelSchema.parse(body);
    const row=await this.tenantDb.run(orgId,tx=>tx.batteryModel.create({data:{organisationId:orgId,modelIdentifier:b.modelIdentifier,category:b.category,name:b.name,chemistry:b.chemistry,applicabilityContext:b.applicabilityContext||{}}}));
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'battery_model.create',resourceType:'battery_model',resourceId:row.id,metadata:{category:row.category}}); return row;
  }

  @Get('battery-models/:id')
  model(@CurrentTenant() orgId:string,@Param('id') id:string){return this.tenantDb.run(orgId,tx=>tx.batteryModel.findFirstOrThrow({where:{id,organisationId:orgId},include:{items:{orderBy:{createdAt:'desc'},take:100},values:{where:{validUntil:null},include:{evidenceLinks:true}}}}));}

  @Post('battery-items')
  async createItem(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=ItemSchema.parse(body);
    const row=await this.tenantDb.run(orgId,async tx=>{await tx.batteryModel.findFirstOrThrow({where:{id:b.modelId,organisationId:orgId}});return tx.batteryItem.create({data:{organisationId:orgId,modelId:b.modelId,serialOrItemIdentifier:b.serialOrItemIdentifier,batchIdentifier:b.batchIdentifier,upi:b.upi,manufactureDate:b.manufactureDate?new Date(b.manufactureDate):undefined}})});
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'battery_item.create',resourceType:'battery_item',resourceId:row.id,metadata:{modelId:row.modelId}});return row;
  }

  @Post('battery-items/bulk')
  async bulk(@CurrentTenant() orgId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=BulkSchema.parse(body);
    const created=await this.tenantDb.run(orgId,async tx=>{
      const modelIds=[...new Set(b.items.map(x=>x.modelId))];
      const count=await tx.batteryModel.count({where:{organisationId:orgId,id:{in:modelIds}}}); if(count!==modelIds.length) throw new Error('One or more modelIds do not belong to tenant');
      const out=[]; for(const i of b.items) out.push(await tx.batteryItem.create({data:{organisationId:orgId,modelId:i.modelId,serialOrItemIdentifier:i.serialOrItemIdentifier,batchIdentifier:i.batchIdentifier,upi:i.upi,manufactureDate:i.manufactureDate?new Date(i.manufactureDate):undefined}})); return out;
    });
    await this.audit.log({organisationId:orgId,actorSubject:actor.subject,action:'battery_item.bulk_create',resourceType:'battery_item',metadata:{count:created.length}});return {count:created.length,items:created};
  }

  @Get('battery-items/:id')
  item(@CurrentTenant() orgId:string,@Param('id') id:string){return this.tenantDb.run(orgId,tx=>tx.batteryItem.findFirstOrThrow({where:{id,organisationId:orgId},include:{model:true,values:{where:{validUntil:null},include:{evidenceLinks:true}},versions:{orderBy:{versionNo:'desc'},take:20},submissions:{orderBy:{createdAt:'desc'},take:20}}}));}
}
