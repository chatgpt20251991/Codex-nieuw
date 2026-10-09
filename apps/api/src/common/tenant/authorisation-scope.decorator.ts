import { SetMetadata } from '@nestjs/common';

export const AUTHORISATION_SCOPE_KEY = 'eubp:authorisationScope';
// Scope requirements are opt-in per handler; legacy routes retain their
// existing tenant-level authorisation contract until separately reviewed.
export const RequireAuthorisationScope = (scope: 'evidenceReview') => SetMetadata(AUTHORISATION_SCOPE_KEY, scope);
