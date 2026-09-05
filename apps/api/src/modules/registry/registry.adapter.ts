export interface PreparedRegistryRecord {
  batteryItemId:string;
  passportVersionId:string;
  upi:string;
  productIdentifier:string;
  schemaStatus:'draft-pending-battery-semantic-catalogue'|'ready';
}
export interface RegistryAdapter {
  readonly name:string;
  submit(records:PreparedRegistryRecord[]):Promise<{correlationId?:string;registryUri?:string;raw?:unknown}>;
}
export class DisabledRegistryAdapter implements RegistryAdapter {
  readonly name='disabled';
  async submit():Promise<never>{throw new Error('Live EU Registry API adapter is disabled until official battery integration details are configured and tested.');}
}
