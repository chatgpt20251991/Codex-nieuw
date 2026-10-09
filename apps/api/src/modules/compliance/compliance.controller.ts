import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { calculateReadiness, crossFieldChecks, fields } from '@eubp/rules';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { PassportDataService } from '../passports/passport-data.service';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly passportData:PassportDataService){}
  @Get('fields') getFields(@Query('category') category='EV'){ return fields.map(f=>({...f,currentRequirement:(f as any).applicability_2027_02_18[category]})); }
  @Post('readiness/:category') readiness(@Param('category') category:any,@Body() body:any){ return calculateReadiness(category,body.values||[],body.context||{}); }
  @Get('model/:modelId/readiness') modelReadiness(@CurrentTenant() orgId:string,@Param('modelId') modelId:string){return this.passportData.modelReadiness(orgId,modelId);}
  @Get('item/:itemId/readiness') async itemReadiness(@CurrentTenant() orgId:string,@Param('itemId') itemId:string){
    const result=await this.passportData.validate(orgId,itemId);
    // Preserve existing readiness counters while exposing the same publication
    // blockers as the read-only passport assessment. Never return raw values,
    // evidence records or canonical passport metadata from this summary.
    return {...result.readiness,crossChecks:result.crossChecks,publishable:result.publishable,publicationBlockers:result.publicationBlockers};
  }
  @Post('cross-check') cross(@Body() body:any){ return {issues:crossFieldChecks(body)}; }
}
