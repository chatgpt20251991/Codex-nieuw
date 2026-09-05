import data from './data-points.json';
import { ApplicabilityContext, BatteryCategory, FieldDefinition, PassportValue, Readiness, Requirement, ValidationIssue } from './types';

export const fields: FieldDefinition[] = (data as any).fields;
const requiredRequirements = new Set<Requirement>(['mandatory','mandatory_dynamic']);
const deferredRequirements = new Set<Requirement>(['deferred_format_pending','deferred_until_august_2027','deferred_article_8']);
const hiddenRequirements = new Set<Requirement>(['not_displayed','not_displayed_duplicate']);
const conditionalRequirements = new Set<Requirement>(['conditional_if_applicable','conditional_if_commercial_warranty','conditional_industrial_cycle_applications','conditional_some_industrial_batteries','conditional_dynamic']);

export function requirementFor(field: FieldDefinition, category: BatteryCategory): Requirement {
  return field.applicability_2027_02_18[category];
}
export function isRequired(req: Requirement): boolean { return requiredRequirements.has(req); }
export function isDeferred(req: Requirement): boolean { return deferredRequirements.has(req); }
export function isHidden(req: Requirement): boolean { return hiddenRequirements.has(req); }
export function isConditional(req: Requirement): boolean { return conditionalRequirements.has(req); }

export function calculateReadiness(category: BatteryCategory, values: PassportValue[], context: ApplicabilityContext = {}): Readiness {
  const byId = new Map(values.map(v => [v.fieldId, v]));
  const conditionalRequired = new Set(context.conditionalRequiredFieldIds || []);
  let required=0, complete=0, verified=0, deferred=0, notDisplayed=0, conditionalOpen=0;
  const blockers: ValidationIssue[]=[]; const warnings: ValidationIssue[]=[];
  for (const f of fields) {
    const req = requirementFor(f, category);
    if (isDeferred(req)) { deferred++; continue; }
    if (isHidden(req)) { notDisplayed++; continue; }
    const requiredNow = isRequired(req) || (isConditional(req) && conditionalRequired.has(f.id));
    if (isConditional(req) && !conditionalRequired.has(f.id)) conditionalOpen++;
    if (!requiredNow) continue;
    required++;
    const v = byId.get(f.id);
    if (v && v.value !== null && v.value !== '' && v.value !== undefined) {
      complete++;
      if (v.validated && (v.evidenceIds?.length ?? 0) > 0) verified++;
      else warnings.push({rule:'BP-EVIDENCE', fieldId:f.id, severity:'warning', message:`${f.name}: value exists but is not fully validated with provenance.`});
    } else blockers.push({rule:'BP-REQUIRED', fieldId:f.id, severity:'blocker', message:`Missing required field ${f.id}: ${f.name}`});
  }
  const score = required === 0 ? 100 : Math.round((complete/required)*100);
  return {score, required, complete, verified, blockers, warnings, deferred, notDisplayed, conditionalOpen};
}

export interface CrossFieldInput { minVoltage?:number; nominalVoltage?:number; maxVoltage?:number; capacity?:number; weight?:number; upi?:string; manufactureDate?:string; materialMassFractions?:number[]; baselineCapacity?:number; currentCapacity?:number; reportedCapacityFadePct?:number; }
export function crossFieldChecks(x: CrossFieldInput): ValidationIssue[] {
 const issues:ValidationIssue[]=[];
 if ([x.minVoltage,x.nominalVoltage,x.maxVoltage].every(v=>typeof v==='number')) {
   if (!(x.minVoltage! <= x.nominalVoltage! && x.nominalVoltage! <= x.maxVoltage!)) issues.push({rule:'BP-X001',severity:'blocker',message:'Voltage must satisfy min ≤ nominal ≤ max.'});
 }
 if (x.capacity !== undefined && x.capacity <= 0) issues.push({rule:'BP-X003',severity:'blocker',message:'Capacity must be greater than zero.'});
 if (x.weight !== undefined && x.weight <= 0) issues.push({rule:'BP-X004',severity:'blocker',message:'Weight must be greater than zero.'});
 if (x.upi && !x.upi.startsWith('https://')) issues.push({rule:'BP-X020',severity:'blocker',message:'UPI must use an HTTPS URL form before Registry submission.'});
 if (x.manufactureDate && new Date(x.manufactureDate).getTime() > Date.now()) issues.push({rule:'BP-X005',severity:'blocker',message:'Manufacture date cannot be in the future.'});
 if (x.materialMassFractions?.length) {
   const sum=x.materialMassFractions.reduce((a,b)=>a+b,0);
   if (sum > 100.0001) issues.push({rule:'BP-X030',severity:'blocker',message:'Material mass fractions cannot exceed 100%.'});
   if (x.materialMassFractions.some(v=>v<0)) issues.push({rule:'BP-X031',severity:'blocker',message:'Material mass fractions cannot be negative.'});
 }
 if (x.baselineCapacity && x.currentCapacity !== undefined && x.reportedCapacityFadePct !== undefined) {
   const expected=(1-(x.currentCapacity/x.baselineCapacity))*100;
   if (Math.abs(expected-x.reportedCapacityFadePct)>1) issues.push({rule:'BP-X032',severity:'warning',message:'Reported capacity fade differs by more than 1 percentage point from baseline/current capacity.'});
 }
 return issues;
}

export function publicFieldIds(): number[] { return fields.filter(f=>f.access_tier==='public').map(f=>f.id); }
export function restrictedFieldIds(): number[] { return fields.filter(f=>f.access_tier!=='public').map(f=>f.id); }
