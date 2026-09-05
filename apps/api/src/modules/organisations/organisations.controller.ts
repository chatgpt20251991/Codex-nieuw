import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import type { Actor } from '../../common/auth/auth.types';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { AuditService } from '../audit/audit.service';

const BootstrapSchema=z.object({ legalName:z.string().min(2), countryCode:z.string().length(2), role:z.string().optional(), vatNumber:z.string().optional() });

const RegistryProfileSchema=z.object({
  entityType:z.enum(['legal_person','natural_person']).default('legal_person'),
  legalName:z.string().min(2).max(50),
  streetAddress:z.string().min(1).max(50),
  postOfficeBox:z.string().max(6).optional().nullable(),
  extendedAddress:z.string().max(50).optional().nullable(),
  locality:z.string().max(50).optional().nullable(),
  postalCode:z.string().max(12).optional().nullable(),
  region:z.string().max(50).optional().nullable(),
  countryOfRegistration:z.string().length(2),
  identifierType:z.enum(['NTR','LEI','VAT','EID','LOCAL']),
  identifierValue:z.string().min(1).max(50),
  complianceEmail:z.string().email(),
  compliancePhoneCountryCode:z.string().min(1).max(6),
  compliancePhone:z.string().min(3).max(30),
  legalRepresentativeFirstName:z.string().min(1).max(50),
  legalRepresentativeLastName:z.string().min(1).max(50),
  legalRepresentativeEmail:z.string().email(),
});

function identifierLimit(type:string){return type==='LEI'?20:type==='VAT'?15:type==='EID'?30:50;}

@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly tenantDb:TenantDbService, private readonly audit:AuditService){}

  @Post('bootstrap')
  async bootstrap(@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=BootstrapSchema.parse(body);
    const exists=await this.tenantDb.run(actor.organisationId, tx=>tx.organisation.findUnique({where:{id:actor.organisationId}}));
    if(exists) throw new ConflictException({code:'ORGANISATION_EXISTS',message:'Organisation already bootstrapped.'});
    const row=await this.tenantDb.run(actor.organisationId, tx=>tx.organisation.create({data:{id:actor.organisationId,legalName:b.legalName,countryCode:b.countryCode.toUpperCase(),role:b.role||'responsible_economic_operator',vatNumber:b.vatNumber}}));
    await this.tenantDb.run(row.id,tx=>tx.user.create({data:{organisationId:row.id,externalSubject:actor.subject,email:actor.email||`${actor.subject}@unknown.invalid`,displayName:actor.displayName,role:actor.role}}));
    await this.audit.log({organisationId:row.id,actorSubject:actor.subject,action:'organisation.bootstrap',resourceType:'organisation',resourceId:row.id});
    return row;
  }

  @Get('current')
  async current(@CurrentTenant() organisationId:string){ return this.tenantDb.run(organisationId,tx=>tx.organisation.findUniqueOrThrow({where:{id:organisationId}})); }

  @Get('authorised-customers')
  async authorisedCustomers(@CurrentActor() actor:Actor){
    const now=new Date();
    return this.tenantDb.run(actor.organisationId,tx=>tx.writtenAuthorisation.findMany({where:{serviceProviderId:actor.organisationId,revokedAt:null,validFrom:{lte:now},OR:[{validUntil:null},{validUntil:{gt:now}}]},include:{responsibleOperator:true},orderBy:{createdAt:'desc'}}));
  }

  @Get('registry-profile')
  async registryProfile(@CurrentTenant() organisationId:string){
    return this.tenantDb.run(organisationId,tx=>tx.registryEnrolmentProfile.findUnique({where:{organisationId}}));
  }

  @Post('registry-profile')
  async upsertRegistryProfile(@CurrentTenant() organisationId:string,@CurrentActor() actor:Actor,@Body() body:unknown){
    const b=RegistryProfileSchema.parse(body);
    const max=identifierLimit(b.identifierType);
    if(b.identifierValue.length>max) throw new ConflictException({code:'REGISTRY_IDENTIFIER_TOO_LONG',message:`${b.identifierType} identifier is limited to ${max} characters in the current Registry user guide.`});
    const data={...b,countryOfRegistration:b.countryOfRegistration.toUpperCase(),postOfficeBox:b.postOfficeBox||null,extendedAddress:b.extendedAddress||null,locality:b.locality||null,postalCode:b.postalCode||null,region:b.region||null};
    const row=await this.tenantDb.run(organisationId,tx=>tx.registryEnrolmentProfile.upsert({where:{organisationId},create:{organisationId,...data},update:data}));
    await this.audit.log({organisationId,actorSubject:actor.subject,action:'registry_profile.upsert',resourceType:'registry_enrolment_profile',resourceId:row.id});
    return row;
  }

  @Get('registry-profile/readiness')
  async registryProfileReadiness(@CurrentTenant() organisationId:string){
    const [org,profile,identities]=await Promise.all([
      this.tenantDb.run(organisationId,tx=>tx.organisation.findUniqueOrThrow({where:{id:organisationId}})),
      this.tenantDb.run(organisationId,tx=>tx.registryEnrolmentProfile.findUnique({where:{organisationId}})),
      this.tenantDb.run(organisationId,tx=>tx.registryIdentity.findMany({where:{organisationId}})),
    ]);
    const blockers:string[]=[]; const warnings:string[]=[];
    if(!profile) blockers.push('Registry enrolment profile has not been completed.');
    if(profile){
      if(profile.legalName!==org.legalName) warnings.push('Registry legal name differs from the platform organisation legal name; confirm the QSeal certificate uses the Registry value exactly.');
      if(profile.countryOfRegistration!==org.countryCode.toUpperCase()) warnings.push('Country of registration differs from the platform organisation country.');
      if(profile.entityType==='legal_person' && !profile.qsealSubjectJson) warnings.push('Qualified electronic seal certificate subject attributes have not yet been captured/checked.');
      if(!profile.declarationSha256) warnings.push('No hash of the EC-sealed/countersigned verification declaration is stored yet.');
    }
    const economic=identities.find(x=>x.actorType==='economic_operator');
    if(!economic || economic.status!=='verified') blockers.push('EU DPP Registry economic-operator verification is not recorded as verified.');
    return {ready:blockers.length===0,blockers,warnings,profile,registryIdentity:economic??null,notes:['Legal-person verification uses a qualified electronic seal (QSeal) or another method allowed by Regulation (EU) 2026/1778.','Do not mark a Registry identity verified from this application until the external Registry verification has actually succeeded.']};
  }
}
