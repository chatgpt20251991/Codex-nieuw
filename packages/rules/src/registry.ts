export interface RegistryFeatureFlags { batterySemanticCatalogueAvailable:boolean; batteryRegistrationAvailable:boolean; }
export function registryGate(flags:RegistryFeatureFlags, blockers:number){
 if(blockers>0) return {allowed:false, code:'COMPLIANCE_BLOCKERS', message:'Resolve compliance blockers before Registry submission.'};
 if(!flags.batterySemanticCatalogueAvailable || !flags.batteryRegistrationAvailable) return {allowed:false, code:'EU_BATTERY_REGISTRY_PENDING', message:'EU Registry battery submission pending EU semantic catalogue.'};
 return {allowed:true, code:'READY', message:'Ready for configured Registry adapter.'};
}
export function chunkForRegistry<T>(items:T[], max=100):T[][]{ if(max<1 || max>100) throw new Error('Registry batch size must be 1..100'); const chunks:T[][]=[]; for(let i=0;i<items.length;i+=max) chunks.push(items.slice(i,i+max)); return chunks; }
