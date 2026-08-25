import { StockMovementType } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { InventoryLedgerService } from './inventory-ledger.service';
import { LowStockEventEmitter } from './low-stock-event.emitter';

describe('InventoryLedgerService', () => {
  const lowStock = new LowStockEventEmitter();

  function mockClient(overrides?: {
    onHand?: number;
    reserved?: number;
    oversellMode?: 'PREVENT' | 'ALLOW';
  }) {
    const onHand = overrides?.onHand ?? 10;
    const reserved = overrides?.reserved ?? 0;
    const created: unknown[] = [];
    let lockedOnHand = onHand;
    let lockedReserved = reserved;
    const client = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wh-1',
          status: 'ACTIVE',
        }),
      },
      inventoryPolicy: {
        findUnique: jest.fn().mockResolvedValue({
          oversellMode: overrides?.oversellMode ?? 'PREVENT',
          allowNegativeStock: false,
          lowStockThreshold: 5,
        }),
      },
      inventoryBalance: {
        upsert: jest.fn().mockResolvedValue({
          warehouseId: 'wh-1',
          productVariantId: 'var-1',
          quantityOnHand: lockedOnHand,
          quantityReserved: lockedReserved,
        }),
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            warehouseId: 'wh-1',
            productVariantId: 'var-1',
            quantityOnHand: lockedOnHand,
            quantityReserved: lockedReserved,
          }),
        ),
        update: jest
          .fn()
          .mockImplementation(
            (args: {
              data: { quantityOnHand: number; quantityReserved: number };
            }) => {
              lockedOnHand = args.data.quantityOnHand;
              lockedReserved = args.data.quantityReserved;
              return Promise.resolve({
                warehouseId: 'wh-1',
                productVariantId: 'var-1',
                quantityOnHand: lockedOnHand,
                quantityReserved: lockedReserved,
              });
            },
          ),
      },
      stockMovement: {
        create: jest.fn().mockImplementation(({ data }: { data: unknown }) => {
          created.push(data);
          return Promise.resolve({ id: 'mov-1', ...(data as object) });
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'bal-1' }]),
      _created: created,
    };
    return client;
  }

  it('appends RECEIVE movement and increases on-hand', async () => {
    const client = mockClient({ onHand: 0, reserved: 0 });
    const service = new InventoryLedgerService(client as never, lowStock);
    const result = await service.appendAndProject(
      {
        warehouseId: 'wh-1',
        productVariantId: 'var-1',
        movementType: StockMovementType.RECEIVE,
        quantity: 25,
        reason: 'PO',
      },
      client as never,
    );
    expect(result.balance.quantityOnHand).toBe(25);
    expect(client.$queryRaw).toHaveBeenCalled();
    expect(client.stockMovement.create).toHaveBeenCalled();
    expect(client._created[0]).toMatchObject({
      movementType: StockMovementType.RECEIVE,
      quantityDelta: 25,
    });
  });

  it('RESERVE increases reserved without reducing on-hand', async () => {
    const client = mockClient({ onHand: 10, reserved: 0 });
    const service = new InventoryLedgerService(client as never, lowStock);
    const result = await service.appendAndProject(
      {
        warehouseId: 'wh-1',
        productVariantId: 'var-1',
        movementType: StockMovementType.RESERVE,
        quantity: 3,
      },
      client as never,
    );
    expect(result.balance.quantityOnHand).toBe(10);
    expect(result.balance.quantityReserved).toBe(3);
  });

  it('blocks oversell under PREVENT policy', async () => {
    const client = mockClient({ onHand: 2, reserved: 0 });
    const service = new InventoryLedgerService(client as never, lowStock);
    await expect(
      service.appendAndProject(
        {
          warehouseId: 'wh-1',
          productVariantId: 'var-1',
          movementType: StockMovementType.RESERVE,
          quantity: 5,
        },
        client as never,
      ),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.INV_INSUFFICIENT },
    });
  });

  it('COMMIT reduces on-hand and reserved', async () => {
    const client = mockClient({ onHand: 10, reserved: 4 });
    const service = new InventoryLedgerService(client as never, lowStock);
    const result = await service.appendAndProject(
      {
        warehouseId: 'wh-1',
        productVariantId: 'var-1',
        movementType: StockMovementType.COMMIT,
        quantity: 4,
      },
      client as never,
    );
    expect(result.balance.quantityOnHand).toBe(6);
    expect(result.balance.quantityReserved).toBe(0);
  });

  it('locks the balance row before availability math', async () => {
    const client = mockClient({ onHand: 5, reserved: 0 });
    const service = new InventoryLedgerService(client as never, lowStock);
    await service.appendAndProject(
      {
        warehouseId: 'wh-1',
        productVariantId: 'var-1',
        movementType: StockMovementType.RESERVE,
        quantity: 1,
      },
      client as never,
    );
    const upsertOrder = client.inventoryBalance.upsert.mock.invocationCallOrder[0];
    const lockOrder = client.$queryRaw.mock.invocationCallOrder[0];
    const findOrder = client.inventoryBalance.findUnique.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(lockOrder);
    expect(lockOrder).toBeLessThan(findOrder);
  });
});
