import { GoneException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantDbService } from '../../common/tenant/tenant-db.service';
import { sha256Hex } from '../../common/crypto/canonical';

@Injectable()
export class AccessTokenService {
  constructor(private readonly prisma:PrismaService,private readonly tenantDb:TenantDbService){}
  async resolve(rawToken:string){if(!rawToken)throw new UnauthorizedException({code:'ACCESS_TOKEN_REQUIRED'});const hash=sha256Hex(rawToken);const rows=await this.prisma.$queryRaw<any[]>`SELECT resolve_access_grant_token(${hash}) AS data`;const meta=rows?.[0]?.data;if(!meta?.id||!meta?.organisationId)throw new UnauthorizedException({code:'INVALID_ACCESS_TOKEN'});const now=Date.now();if(meta.revokedAt||new Date(meta.validFrom).getTime()>now||(meta.validUntil&&new Date(meta.validUntil).getTime()<=now))throw new GoneException({code:'ACCESS_GRANT_INACTIVE'});const grant=await this.tenantDb.run(meta.organisationId,tx=>tx.accessGrant.findFirstOrThrow({where:{id:meta.id,organisationId:meta.organisationId}}));return {organisationId:meta.organisationId,grant};}
}
