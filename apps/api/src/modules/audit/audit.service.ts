import { Injectable } from '@nestjs/common';
import { TenantDbService } from '../../common/tenant/tenant-db.service';

@Injectable()
export class AuditService {
  constructor(private readonly tenantDb: TenantDbService) {}
  async log(input: { organisationId:string; actorSubject?:string; action:string; resourceType:string; resourceId?:string; metadata?:any; requestId?:string; beforeHash?:string; afterHash?:string }) {
    return this.tenantDb.run(input.organisationId, tx => tx.auditEvent.create({ data: {
      organisationId: input.organisationId,
      actorSubject: input.actorSubject,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata || {},
      requestId: input.requestId,
      beforeHash: input.beforeHash,
      afterHash: input.afterHash,
    }}));
  }
}
