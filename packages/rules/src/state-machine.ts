export type PassportState='draft'|'data_collection'|'validation_failed'|'ready'|'published'|'registry_pending'|'registered'|'updated'|'superseded'|'recycled';
const transitions:Record<PassportState,PassportState[]>={
 draft:['data_collection'], data_collection:['validation_failed','ready'], validation_failed:['data_collection','ready'],
 ready:['published'], published:['registry_pending','updated','recycled'], registry_pending:['registered','updated','recycled'],
 registered:['updated','recycled'], updated:['published','registry_pending','registered','recycled'], superseded:[], recycled:[]
};
export function canTransition(from:PassportState,to:PassportState){ return transitions[from].includes(to); }
export function transition(from:PassportState,to:PassportState){ if(!canTransition(from,to)) throw new Error(`Invalid passport transition ${from} -> ${to}`); return to; }
