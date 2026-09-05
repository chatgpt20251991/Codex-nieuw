import { fields } from '@eubp/rules';

export type CapabilityTier = 'legitimate_interest_model' | 'legitimate_interest_item';

export function isCapabilityTier(value: string): value is CapabilityTier {
  return value === 'legitimate_interest_model' || value === 'legitimate_interest_item';
}

// Explicit external contract: neither canonical metadata nor stored accessTier labels
// can override the rule catalogue. Evidence IDs and internal keys stay internal.
export function projectPassport(canonical: any, tier?: CapabilityTier) {
  const allowed = new Set(fields.filter(field => field.access_tier === 'public' || field.access_tier === tier)
    .map(field => field.id));
  const battery = canonical.battery;
  return {
    schema: canonical.schema,
    ruleSetVersion: canonical.ruleSetVersion,
    generatedAt: canonical.generatedAt,
    battery: battery ? {
      publicId: battery.publicId,
      modelIdentifier: battery.modelIdentifier,
      serial: battery.serial,
      batch: battery.batch,
      upi: battery.upi,
      category: battery.category,
      // This alias carries field 67 data and follows the same access policy.
      ...(allowed.has(67) ? { lifecycleStatus: battery.lifecycleStatus } : {}),
    } : undefined,
    values: (Array.isArray(canonical.values) ? canonical.values : [])
      .filter((value: any) => value && allowed.has(value.fieldId))
      .map((value: any) => ({ fieldId: value.fieldId, name: value.name, value: value.value, unit: value.unit })),
  };
}
