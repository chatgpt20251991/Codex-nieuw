import{env}from"cloudflare:workers";
export function intakeDb(){if(!env.DB)throw new Error("Intake storage unavailable");return env.DB;}

