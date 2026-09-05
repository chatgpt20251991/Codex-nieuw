import type { AccessDecision, AccessTier } from './types';

const authorityRoles = new Set(['market_surveillance_authority','notified_body','eu_commission']);

export function decideAccess(input: {
  tier: AccessTier;
  actorRole?: string;
  explicitGrantTiers?: AccessTier[];
}): AccessDecision {
  if (input.tier === 'public') return { allowed:true, reason:'PUBLIC_DATA' };
  if (input.tier === 'authority_only') {
    return authorityRoles.has(input.actorRole || '')
      ? { allowed:true, reason:'AUTHORITY_ROLE' }
      : { allowed:false, reason:'AUTHORITY_ONLY' };
  }
  const granted = new Set(input.explicitGrantTiers || []);
  return granted.has(input.tier)
    ? { allowed:true, reason:'EXPLICIT_ACCESS_GRANT' }
    : { allowed:false, reason:'EXPLICIT_GRANT_REQUIRED' };
}
