import { ConflictException, NotFoundException } from '@nestjs/common';
import type { BatteryItem, Prisma } from '@prisma/client';

// Model values are inherited by every item. Lock the model before its items so
// publication and every value writer observe one consistent aggregate.
export async function lockModel(tx: Prisma.TransactionClient, organisationId: string, modelId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "BatteryModel" WHERE "id" = ${modelId}
    AND "organisationId" = ${organisationId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException();
}

export async function lockItem(tx: Prisma.TransactionClient, organisationId: string, itemId: string) {
  const item = await tx.batteryItem.findFirstOrThrow({ where: { id: itemId, organisationId } });
  await lockModel(tx, organisationId, item.modelId);
  await tx.$queryRaw`SELECT "id" FROM "BatteryItem" WHERE "id" = ${itemId}
    AND "organisationId" = ${organisationId} FOR UPDATE`;
  return tx.batteryItem.findFirstOrThrow({ where: { id: itemId, organisationId } });
}

export function assertActive(item: Pick<BatteryItem, 'passportState' | 'lifecycleStatus'>) {
  if (['recycled', 'superseded'].includes(item.passportState) || item.lifecycleStatus === 'recycled') {
    throw new ConflictException({ code: 'PASSPORT_LIFECYCLE_CLOSED' });
  }
}

export async function lockValueOwner(tx: Prisma.TransactionClient, organisationId: string,
  owner: { batteryItemId: string | null; modelId: string | null }) {
  if (owner.batteryItemId) assertActive(await lockItem(tx, organisationId, owner.batteryItemId));
  else if (owner.modelId) await lockModel(tx, organisationId, owner.modelId);
  else throw new ConflictException({ code: 'VALUE_OWNER_REQUIRED' });
}

export async function invalidatePassports(tx: Prisma.TransactionClient, organisationId: string,
  owner: { batteryItemId?: string | null; modelId?: string | null }) {
  const where = { organisationId, ...(owner.batteryItemId ? { id: owner.batteryItemId } : { modelId: owner.modelId! }) };
  await tx.batteryItem.updateMany({ where: { ...where, passportState: { in: ['published', 'registered', 'registry_pending'] } },
    data: { passportState: 'updated' } });
  await tx.batteryItem.updateMany({ where: { ...where, passportState: 'ready' }, data: { passportState: 'data_collection' } });
}
