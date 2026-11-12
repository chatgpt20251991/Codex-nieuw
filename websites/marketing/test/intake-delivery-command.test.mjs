import assert from 'node:assert/strict';
import test from 'node:test';
import {deliveryCommandSchema} from '../lib/intake-delivery-command.ts';

test('delivery commands retain the exact worker contract after the Zod upgrade', () => {
  for (const action of ['claim', 'status']) {
    assert.deepEqual(deliveryCommandSchema.parse({action}), {action});
  }
  for (const outcome of ['accepted', 'retry', 'uncertain']) {
    const command = {action: 'ack', id: crypto.randomUUID(), lease: crypto.randomUUID(), outcome};
    assert.deepEqual(deliveryCommandSchema.parse(command), command);
  }
});

test('delivery commands reject unknown properties and invalid actions without coercion', () => {
  const invalid = [null, [], '', {}, {action: true}, {action: 'delete'},
    {action: 'claim', id: crypto.randomUUID()}, {action: 'status', includeToken: true},
    {action: 'ack', id: crypto.randomUUID(), lease: crypto.randomUUID(), outcome: 'accepted', attempts: 0}];
  for (const command of invalid) assert.equal(deliveryCommandSchema.safeParse(command).success, false);
});

test('acknowledgements require both valid UUIDs and one explicit delivery outcome', () => {
  const valid = {action: 'ack', id: crypto.randomUUID(), lease: crypto.randomUUID(), outcome: 'accepted'};
  for (const key of ['id', 'lease', 'outcome']) {
    const missing = {...valid}; delete missing[key];
    assert.equal(deliveryCommandSchema.safeParse(missing).success, false);
    for (const value of [null, true, 1, {}, [], '', 'not-a-uuid-or-outcome']) {
      assert.equal(deliveryCommandSchema.safeParse({...valid, [key]: value}).success, false);
    }
  }
});
