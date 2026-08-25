import { BadRequestException } from '@nestjs/common';
import {
  ProductType,
  ReservationStatus,
  StockMovementType,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { InventoryReservationService } from './inventory-reservation.service';

describe('InventoryReservationService', () => {
  function buildDeps() {
    const ledger = {
      appendAndProject: jest.fn().mockResolvedValue({
        movement: { id: 'mov-1' },
        balance: { quantityOnHand: 10, quantityReserved: 1 },
      }),
    };
    const warehouses = {
      resolveWarehouseId: jest.fn().mockResolvedValue('wh-1'),
    };
    const policies = {
      getOrCreateDefault: jest.fn().mockResolvedValue({
        reservationTimeoutMinutes: 60,
      }),
    };

    const variants: Record<
      string,
      {
        id: string;
        isFulfillable: boolean;
        product: { productType: ProductType };
      }
    > = {
      'var-tracked': {
        id: 'var-tracked',
        isFulfillable: true,
        product: { productType: ProductType.STANDARD },
      },
      'var-digital': {
        id: 'var-digital',
        isFulfillable: false,
        product: { productType: ProductType.DIGITAL },
      },
    };

    const tx = {
      stockReservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'res-1',
          orderId: 'ord-1',
          status: ReservationStatus.PENDING,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'res-1',
          orderId: 'ord-1',
          status: ReservationStatus.PENDING,
          lines: [
            {
              warehouseId: 'wh-1',
              productVariantId: 'var-tracked',
              quantity: 2,
            },
          ],
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'res-1',
            orderId: 'ord-1',
            status: data.status,
            lines: [
              {
                warehouseId: 'wh-1',
                productVariantId: 'var-tracked',
                quantity: 2,
              },
            ],
          }),
        ),
      },
      stockReservationLine: {
        create: jest.fn().mockResolvedValue({ id: 'line-1' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'res-1' }]),
    };

    const prisma = {
      productVariant: {
        findFirst: jest.fn().mockImplementation(({ where: { id } }) =>
          Promise.resolve(variants[id] ?? null),
        ),
      },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(tx)),
      stockReservation: tx.stockReservation,
    };

    const service = new InventoryReservationService(
      prisma as never,
      ledger as never,
      warehouses as never,
      policies as never,
    );

    return { service, prisma, tx, ledger, warehouses, policies };
  }

  it('reserveForOrder skips digital lines and reserves tracked only', async () => {
    const { service, tx, ledger } = buildDeps();
    await service.reserveForOrder(
      'ord-1',
      [
        { productVariantId: 'var-tracked', quantity: 2 },
        { productVariantId: 'var-digital', quantity: 1 },
      ],
      'actor-1',
      tx as never,
    );
    expect(tx.stockReservationLine.create).toHaveBeenCalledTimes(1);
    expect(ledger.appendAndProject).toHaveBeenCalledWith(
      expect.objectContaining({
        productVariantId: 'var-tracked',
        quantity: 2,
        movementType: StockMovementType.RESERVE,
      }),
      tx,
    );
  });

  it('reserveForOrder is idempotent when PENDING reservation exists', async () => {
    const { service, tx, ledger } = buildDeps();
    tx.stockReservation.findUnique.mockResolvedValue({
      id: 'res-existing',
      orderId: 'ord-1',
      status: ReservationStatus.PENDING,
      lines: [],
    });
    const result = await service.reserveForOrder(
      'ord-1',
      [{ productVariantId: 'var-tracked', quantity: 1 }],
      undefined,
      tx as never,
    );
    expect(result?.id).toBe('res-existing');
    expect(tx.stockReservation.create).not.toHaveBeenCalled();
    expect(ledger.appendAndProject).not.toHaveBeenCalled();
  });

  it('reserveForOrder returns null when all lines are digital', async () => {
    const { service, tx } = buildDeps();
    const result = await service.reserveForOrder(
      'ord-1',
      [{ productVariantId: 'var-digital', quantity: 1 }],
      undefined,
      tx as never,
    );
    expect(result).toBeNull();
  });

  it('HTTP reserve rejects untracked lines', async () => {
    const { service } = buildDeps();
    await expect(
      service.reserve({
        orderId: 'ord-1',
        lines: [{ productVariantId: 'var-digital', quantity: 1 }],
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.INV_NOT_TRACKED },
    });
  });

  it('release is idempotent when already RELEASED', async () => {
    const { service, tx, ledger } = buildDeps();
    tx.stockReservation.findUnique.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.RELEASED,
      lines: [],
    });
    const result = await service.release('res-1', undefined, tx as never);
    expect(result.status).toBe(ReservationStatus.RELEASED);
    expect(ledger.appendAndProject).not.toHaveBeenCalled();
  });

  it('commit is idempotent when already COMMITTED', async () => {
    const { service, tx, ledger } = buildDeps();
    tx.stockReservation.findUnique.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.COMMITTED,
      lines: [],
    });
    const result = await service.commit('res-1', undefined, tx as never);
    expect(result.status).toBe(ReservationStatus.COMMITTED);
    expect(ledger.appendAndProject).not.toHaveBeenCalled();
  });

  it('commit after RELEASED fails', async () => {
    const { service, tx } = buildDeps();
    tx.stockReservation.findUnique.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.RELEASED,
      lines: [],
    });
    await expect(
      service.commit('res-1', undefined, tx as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
