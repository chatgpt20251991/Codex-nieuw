export type BatteryCategory = 'EV'|'LMT'|'INDUSTRIAL_GT_2KWH';
export type Requirement = 'mandatory'|'optional_if_available'|'not_displayed_duplicate'|'deferred_format_pending'|'deferred_until_august_2027'|'deferred_article_8'|'conditional_if_applicable'|'not_displayed'|'conditional_if_commercial_warranty'|'conditional_industrial_cycle_applications'|'conditional_some_industrial_batteries'|'mandatory_dynamic'|'conditional_dynamic';
export type AccessTier='public'|'legitimate_interest_model'|'authority_only'|'legitimate_interest_item';
export interface FieldDefinition { id:number; name:string; legal_source:string; applicability_2027_02_18:Record<BatteryCategory,Requirement>; access_tier:AccessTier; data_nature:string; platform_evidence_policy:string; note:string; }
export interface PassportValue { fieldId:number; value:unknown; unit?:string; evidenceIds?:string[]; validated?:boolean; }
export interface ValidationIssue { rule:string; fieldId?:number; severity:'warning'|'blocker'; message:string; }
export interface ApplicabilityContext { conditionalRequiredFieldIds?:number[]; }
export interface Readiness { score:number; required:number; complete:number; verified:number; blockers:ValidationIssue[]; warnings:ValidationIssue[]; deferred:number; notDisplayed:number; conditionalOpen:number; }
export interface AccessDecision { allowed:boolean; reason:string; }
