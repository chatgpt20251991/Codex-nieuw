import { GoneException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256Hex } from '../../common/crypto/canonical';
import { TenantDbService } from '../../common/tenant/tenant-db.service';

@Injectable()
export class SupplierTokenService {
  constructor(private readonly prisma:PrismaService,private readonly tenantDb:TenantDbService){}
  async resolve(rawToken:string){
    if(!rawToken) throw new UnauthorizedException({code:'SUPPLIER_TOKEN_REQUIRED'});
    const hash=sha256Hex(rawToken);
    const rows=await this.prisma.$queryRaw<any[]>`SELECT resolve_supplier_request_token(${hash}) AS data`;
    const meta=rows?.[0]?.data;
    if(!meta?.id||!meta?.organisationId) throw new UnauthorizedException({code:'INVALID_SUPPLIER_TOKEN'});
    if(new Date(meta.expiresAt).getTime()<=Date.now()) throw new GoneException({code:'SUPPLIER_TOKEN_EXPIRED'});
    if(['cancelled','expired','accepted'].includes(String(meta.status))) throw new GoneException({code:'SUPPLIER_REQUEST_CLOSED',status:meta.status});
    const request=await this.tenantDb.run(meta.organisationId,tx=>tx.supplierRequest.findFirstOrThrow({where:{id:meta.id,organisationId:meta.organisationId},include:{supplier:true,model:true,fields:true,submissions:{include:{evidence:true}}}}));
    return {organisationId:meta.organisationId,request,hash};
  }
}
