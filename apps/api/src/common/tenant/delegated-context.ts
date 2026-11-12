import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthorisationScope } from './authorisation-scope.decorator';

export interface DelegatedContext {
  authorisationId: string;
  providerOrganisationId: string;
  responsibleOrganisationId: string;
  actorSubject: string;
  requiredScope: AuthorisationScope;
  requestId: string;
  handler: string;
}
export const delegatedContext = new AsyncLocalStorage<Readonly<DelegatedContext>>();
