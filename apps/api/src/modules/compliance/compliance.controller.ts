import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { calculateReadiness, crossFieldChecks, fields } from '@eubp/rules';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';

function activeValue(v:any){return {fieldId:v.fieldDefinitionId,value:v.valueJson,unit:v.unit||undefined,validated:v.validationStatus==='validated',evidenceIds:v.evidenceLinks.map((e:any)=>e.evidenceId)}}
function contextFromModel(model:any){const x:any=model.applicabilityContext||{};return {conditionalRequiredFieldIds:Array.isArray(x.conditionalRequiredFieldIds)?x.conditionalRequiredFieldIds.map(Number):[]}}

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly tenantDb:TenantDbService){}
  @Get('fields') getFields(@Query('category') category='EV'){ return fields.map(f=>({...f,currentRequirement:(f as any).applicability_2027_02_18[category]})); }
  @Post('readiness/:category') readiness(@Param('category') category:any,@Body() body:any){ return calculateReadiness(category,body.values||[],body.context||{}); }
  @Get('model/:modelId/readiness') async modelReadiness(@CurrentTenant() orgId:string,@Param('modelId') modelId:string){return this.tenantDb.run(orgId,async tx=>{const m=await tx.batteryModel.findFirstOrThrow({where:{id:modelId,organisationId:orgId},include:{values:{where:{validUntil:null},include:{evidenceLinks:true}}}});return calculateReadiness(m.category as any,m.values.map(activeValue),contextFromModel(m));});}
  @Get('item/:itemId/readiness') async itemReadiness(@CurrentTenant() orgId:string,@Param('itemId') itemId:string){return this.tenantDb.run(orgId,async tx=>{const item=await tx.batteryItem.findFirstOrThrow({where:{id:itemId,organisationId:orgId},include:{model:{include:{values:{where:{validUntil:null},include:{evidenceLinks:true}}}},values:{where:{validUntil:null},include:{evidenceLinks:true}}}});const merged=new Map<number,any>();for(const v of item.model.values)merged.set(v.fieldDefinitionId,v);for(const v of item.values)merged.set(v.fieldDefinitionId,v);return calculateReadiness(item.model.category as any,[...merged.values()].map(activeValue),contextFromModel(item.model));});}
  @Post('cross-check') cross(@Body() body:any){ return {issues:crossFieldChecks(body)}; }
}
