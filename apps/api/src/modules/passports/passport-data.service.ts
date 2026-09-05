import { Injectable } from '@nestjs/common';
import { usableEvidence } from '../../common/storage/evidence-storage.service';
import { calculateReadiness, crossFieldChecks, fields } from '@eubp/rules';
import type { Prisma } from '@prisma/client';
import { TenantDbService } from '../../common/tenant/tenant-db.service';

@Injectable()
export class PassportDataService {
  constructor(private readonly tenantDb:TenantDbService){}

  async loadMerged(organisationId:string,itemId:string){return this.tenantDb.run(organisationId,tx=>this.loadMergedTx(tx,organisationId,itemId));}

  async loadMergedTx(tx:Prisma.TransactionClient,organisationId:string,itemId:string){
    const item=await tx.batteryItem.findFirstOrThrow({where:{id:itemId,organisationId},include:{model:{include:{values:{where:{validUntil:null,validationStatus:{not:'superseded'}},include:{evidenceLinks:{include:{evidence:true}}}}}},values:{where:{validUntil:null,validationStatus:{not:'superseded'}},include:{evidenceLinks:{include:{evidence:true}}}}}});
    const map=new Map<number,any>(); for(const v of item.model.values)map.set(v.fieldDefinitionId,v);for(const v of item.values)map.set(v.fieldDefinitionId,v);
    return {item,values:[...map.values()]};
  }

  async validate(organisationId:string,itemId:string){
    const {item,values}=await this.loadMerged(organisationId,itemId); const applicability:any=item.model.applicabilityContext||{};
    const input=values.map(v=>({fieldId:v.fieldDefinitionId,value:v.valueJson,unit:v.unit||undefined,validated:v.validationStatus==='validated',evidenceIds:v.evidenceLinks.filter((x:any)=>usableEvidence(x.evidence)).map((x:any)=>x.evidenceId)}));
    const readiness=calculateReadiness(item.model.category as any,input,{conditionalRequiredFieldIds:Array.isArray(applicability.conditionalRequiredFieldIds)?applicability.conditionalRequiredFieldIds.map(Number):[]});
    const byId=new Map(values.map(v=>[v.fieldDefinitionId,v])); const num=(id:number)=>{const v:any=byId.get(id)?.valueJson; return typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):undefined};
    const cross=crossFieldChecks({minVoltage:num(26),nominalVoltage:num(27),maxVoltage:num(28),capacity:num(11),weight:num(10),upi:undefined,manufactureDate:item.manufactureDate?.toISOString(),baselineCapacity:num(11),currentCapacity:num(51),reportedCapacityFadePct:num(52)});
    const provenanceBlockers=readiness.warnings.map(w=>({...w,severity:'blocker' as const,message:'Publication provenance gate: '+w.message}));
    const publicationBlockers=[...readiness.blockers,...cross.filter(x=>x.severity==='blocker'),...provenanceBlockers];
    return {item,values,readiness,crossChecks:cross,publishable:publicationBlockers.length===0,publicationBlockers};
  }

  definitions(){return new Map(fields.map(f=>[f.id,f]));}
}
