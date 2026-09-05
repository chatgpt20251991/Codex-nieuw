import { ConflictException, Injectable } from '@nestjs/common';
import { EvidenceStorageService } from '../../../common/storage/evidence-storage.service';
import { ConfigService } from '@nestjs/config';
import { TenantDbService } from '../../../common/tenant/tenant-db.service';
import { StorageService } from '../../../common/storage/storage.service';
import { fields } from '@eubp/rules';

@Injectable()
export class ExtractionService {
  constructor(private readonly config:ConfigService,private readonly tenantDb:TenantDbService,private readonly storage:StorageService,private readonly evidenceStorage:EvidenceStorageService){}

  async extractNow(organisationId:string,evidenceId:string,actorSubject:string){
    const provider=this.config.get<string>('EVIDENCE_EXTRACTOR')||'disabled';
    if(provider==='disabled') throw new ConflictException({code:'EXTRACTION_DISABLED',message:'Evidence extraction provider is not configured.'});
    if(provider!=='webhook') throw new ConflictException({code:'EXTRACTION_PROVIDER_UNSUPPORTED',message:`Unsupported extractor provider: ${provider}`});
    const url=this.config.get<string>('EXTRACTION_WEBHOOK_URL'); if(!url) throw new ConflictException('EXTRACTION_WEBHOOK_URL is required.');
    const evidence=await this.evidenceStorage.forExtraction(organisationId,evidenceId);
    const job=await this.tenantDb.run(organisationId,async tx=>{const job=await tx.extractionJob.create({data:{organisationId,evidenceId,provider:'webhook',status:'processing',startedAt:new Date()}});await tx.auditEvent.create({data:{organisationId,actorSubject,action:'evidence.extract',resourceType:'evidence',resourceId:evidenceId,metadata:{jobId:job.id}}});return job;});
    try{
      const signedUrl=await this.storage.createDownloadUrl(evidence.objectKey,300);
      const signal=AbortSignal.timeout(60_000);
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${this.config.get<string>('EXTRACTION_WEBHOOK_SECRET')||''}`},body:JSON.stringify({jobId:job.id,evidence:{id:evidence.id,mimeType:evidence.mimeType,downloadUrl:signedUrl},fieldDefinitions:fields.map(f=>({id:f.id,name:f.name,legalSource:f.legal_source}))}),signal});
      if(!response.ok) throw new Error(`Extractor returned HTTP ${response.status}`);
      const payload:any=await response.json(); const claims=Array.isArray(payload.claims)?payload.claims:[];
      const sanitized=claims.filter((c:any)=>Number.isInteger(Number(c.fieldDefinitionId))&&Number(c.fieldDefinitionId)>=1&&Number(c.fieldDefinitionId)<=71).slice(0,250);
      await this.tenantDb.run(organisationId,async tx=>{
        for(const c of sanitized) await tx.extractedClaim.create({data:{extractionJobId:job.id,fieldDefinitionId:Number(c.fieldDefinitionId),proposedValue:c.value,proposedUnit:c.unit,confidence:typeof c.confidence==='number'?c.confidence:undefined,locatorJson:c.locator||undefined,state:'suggested'}});
        await tx.extractionJob.update({where:{id:job.id},data:{status:'completed',completedAt:new Date(),responseJson:{claimCount:sanitized.length}}});
      });
      return {jobId:job.id,status:'completed',claimCount:sanitized.length,notice:'Extracted claims are suggestions only and can never auto-validate passport data.'};
    }catch(error:any){
      await this.tenantDb.run(organisationId,tx=>tx.extractionJob.update({where:{id:job.id},data:{status:'failed',completedAt:new Date(),errorMessage:String(error?.message||error)}})); throw error;
    }
  }
}
