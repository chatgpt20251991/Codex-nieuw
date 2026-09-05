export type RegistryActorType = 'economic_operator' | 'value_chain_actor';
export type RegistryVerificationStatus = 'unverified' | 'pending' | 'verified' | 'expired' | 'rejected';

export interface RegistryIdentitySnapshot {
  actorType: RegistryActorType;
  status: RegistryVerificationStatus;
  verifiedAt?: string | Date;
  validUntil?: string | Date;
  electronicIdExpiresAt?: string | Date;
}

export interface RegistryDelegatedActionContext {
  responsibleOperator: RegistryIdentitySnapshot;
  actingParty: RegistryIdentitySnapshot;
  actingOnBehalf: boolean;
  hasActiveWrittenAuthorisation: boolean;
  now?: string | Date;
}

export interface RegistryActorGateResult {
  allowed: boolean;
  code: string;
  message: string;
}

function asTime(value?: string | Date): number | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : undefined;
}

export function identityIsCurrentlyVerified(identity: RegistryIdentitySnapshot, now: string | Date = new Date()): boolean {
  if (identity.status !== 'verified') return false;
  const nowMs = asTime(now)!;
  const verifiedAt = asTime(identity.verifiedAt);
  if (verifiedAt === undefined || verifiedAt > nowMs) return false;

  // Article 4/5 verification is valid only until the electronic identification means expires
  // and in any event no longer than three years from verification. We enforce the shortest horizon.
  const threeYearsMs = verifiedAt + (3 * 365.2425 * 24 * 60 * 60 * 1000);
  const horizons = [threeYearsMs, asTime(identity.validUntil), asTime(identity.electronicIdExpiresAt)]
    .filter((x): x is number => x !== undefined);
  const effectiveExpiry = Math.min(...horizons);
  return effectiveExpiry > nowMs;
}

/**
 * Conservative product gate derived from Commission Implementing Regulation (EU) 2026/1778.
 * It intentionally requires both the responsible economic operator and delegated third party
 * to hold a current Registry verification before we allow a delegated submission path.
 * This is stricter than blindly relying on an organisation's internal role label.
 */
export function delegatedRegistryActorGate(ctx: RegistryDelegatedActionContext): RegistryActorGateResult {
  const now = ctx.now ?? new Date();

  if (ctx.responsibleOperator.actorType !== 'economic_operator') {
    return { allowed: false, code: 'RESPONSIBLE_ACTOR_NOT_ECONOMIC_OPERATOR', message: 'The responsible Registry actor must be an economic operator.' };
  }
  if (!identityIsCurrentlyVerified(ctx.responsibleOperator, now)) {
    return { allowed: false, code: 'RESPONSIBLE_OPERATOR_NOT_VERIFIED', message: 'The responsible economic operator must hold a current EU DPP Registry verification.' };
  }

  if (!ctx.actingOnBehalf) {
    if (ctx.actingParty.actorType !== 'economic_operator') {
      return { allowed: false, code: 'DIRECT_ACTOR_NOT_ECONOMIC_OPERATOR', message: 'A direct registrant must be the verified economic operator.' };
    }
    if (!identityIsCurrentlyVerified(ctx.actingParty, now)) {
      return { allowed: false, code: 'DIRECT_ACTOR_NOT_VERIFIED', message: 'The direct registrant is not currently verified.' };
    }
    return { allowed: true, code: 'ACTOR_READY', message: 'Registry actor identity gate passed.' };
  }

  if (!ctx.hasActiveWrittenAuthorisation) {
    return { allowed: false, code: 'NO_ACTIVE_WRITTEN_AUTHORISATION', message: 'A current written authorisation is required for delegated Registry actions.' };
  }
  if (ctx.actingParty.actorType !== 'value_chain_actor') {
    return { allowed: false, code: 'THIRD_PARTY_NOT_VALUE_CHAIN_ACTOR', message: 'The delegated third party must use a verified value-chain-actor Registry identity.' };
  }
  if (!identityIsCurrentlyVerified(ctx.actingParty, now)) {
    return { allowed: false, code: 'THIRD_PARTY_NOT_VERIFIED', message: 'The delegated third party is not currently verified under the Registry value-chain-actor process.' };
  }

  return { allowed: true, code: 'ACTOR_READY', message: 'Delegated Registry actor identity gate passed.' };
}
