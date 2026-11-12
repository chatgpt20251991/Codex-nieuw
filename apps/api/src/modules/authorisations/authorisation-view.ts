import type { Prisma, WrittenAuthorisation } from '@prisma/client';
import { isAuthorisationScopeRecord } from '../../common/tenant/authorisation-scope.decorator';

// Neither document storage locators nor document hashes belong in grant-management
// responses. Keep the same explicit projection for list, create and revoke.
export const authorisationViewSelect = {
  id: true, responsibleOperatorId: true, serviceProviderId: true, scopeJson: true,
  validFrom: true, validUntil: true, revokedAt: true, createdAt: true,
} satisfies Prisma.WrittenAuthorisationSelect;

type AuthorisationViewRow = Pick<WrittenAuthorisation,
  'id' | 'responsibleOperatorId' | 'serviceProviderId' | 'scopeJson' |
  'validFrom' | 'validUntil' | 'revokedAt' | 'createdAt'>;

export function projectAuthorisation(row: AuthorisationViewRow) {
  const scopeValid = isAuthorisationScopeRecord(row.scopeJson);
  return {
    id: row.id, responsibleOperatorId: row.responsibleOperatorId,
    serviceProviderId: row.serviceProviderId, scopeJson: scopeValid ? row.scopeJson : {},
    validFrom: row.validFrom, validUntil: row.validUntil, revokedAt: row.revokedAt,
    createdAt: row.createdAt, scopeValid,
  };
}
