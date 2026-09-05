import type { PreparedRegistryRecord } from './registry-contract';
export type { PreparedRegistryRecord } from './registry-contract';
export interface RegistryAdapter {
  readonly name:string;
  submit(records:PreparedRegistryRecord[]):Promise<{correlationId?:string;registryUri?:string;raw?:unknown}>;
}
export class DisabledRegistryAdapter implements RegistryAdapter {
  readonly name='disabled';
  async submit():Promise<never>{throw new Error('Live EU Registry API adapter is disabled until official battery integration details are configured and tested.');}
}
