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
        findUnique: jest.fn().mockResolvedValue({
          warehouseId: 'wh-1',
          productVariantId: 'var-1',
          quantityOnHand: onHand,
          quantityReserved: reserved,
        }),
        upsert: jest
          .fn()
          .mockImplementation(
            (args: {
              update?: { quantityOnHand: number; quantityReserved: number };
              create: { quantityOnHand: number; quantityReserved: number };
            }) =>
              Promise.resolve({
                warehouseId: 'wh-1',
                productVariantId: 'var-1',
                quantityOnHand:
                  args.update?.quantityOnHand ?? args.create.quantityOnHand,
                quantityReserved:
                  args.update?.quantityReserved ?? args.create.quantityReserved,
              }),
          ),
      },
      stockMovement: {
        create: jest.fn().mockImplementation(({ data }: { data: unknown }) => {
          created.push(data);
          return Promise.resolve({ id: 'mov-1', ...(data as object) });
        }),
      },
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
});
