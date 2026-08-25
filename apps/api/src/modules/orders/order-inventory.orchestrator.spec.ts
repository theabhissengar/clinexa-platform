import { BadRequestException } from '@nestjs/common';
import { OrderStatus, ReservationStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { OrderInventoryOrchestrator } from './order-inventory.orchestrator';

describe('OrderInventoryOrchestrator', () => {
  function build() {
    const reservations = {
      reserveForOrder: jest.fn(),
      findByOrderId: jest.fn(),
      release: jest.fn(),
      commit: jest.fn(),
    };
    const restock = {
      restockCommittedReservation: jest.fn(),
    };
    const tx = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const orch = new OrderInventoryOrchestrator(
      reservations as never,
      restock as never,
    );
    return { orch, reservations, restock, tx };
  }

  it('reserve_on_auth_success reserves and persists reservationId', async () => {
    const { orch, reservations, tx } = build();
    tx.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      reservationId: null,
      items: [{ variantId: 'var-1', quantity: 2 }],
    });
    reservations.reserveForOrder.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.PENDING,
    });

    await orch.applyTransitionIntent(
      'reserve_on_auth_success',
      'ord-1',
      'actor',
      tx as never,
    );

    expect(reservations.reserveForOrder).toHaveBeenCalledWith(
      'ord-1',
      [{ productVariantId: 'var-1', quantity: 2 }],
      'actor',
      tx,
    );
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'ord-1' },
      data: { reservationId: 'res-1' },
    });
  });

  it('reserve_on_auth_success surfaces ERR-INV-001 from reservation service', async () => {
    const { orch, reservations, tx } = build();
    tx.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      reservationId: null,
      items: [{ variantId: 'var-1', quantity: 2 }],
    });
    reservations.reserveForOrder.mockRejectedValue(
      new BadRequestException({
        code: ErrorCodes.INV_INSUFFICIENT,
        message: 'Insufficient stock for this operation',
      }),
    );

    await expect(
      orch.applyTransitionIntent(
        'reserve_on_auth_success',
        'ord-1',
        'actor',
        tx as never,
      ),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.INV_INSUFFICIENT },
    });
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('release_on_cancel_or_decline no-ops without PENDING reservation', async () => {
    const { orch, reservations } = build();
    reservations.findByOrderId.mockResolvedValue(null);
    await orch.applyTransitionIntent(
      'release_on_cancel_or_decline',
      'ord-1',
      undefined,
      {} as never,
    );
    expect(reservations.release).not.toHaveBeenCalled();
  });

  it('commit_on_fulfill commits PENDING reservation', async () => {
    const { orch, reservations, tx } = build();
    reservations.findByOrderId.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.PENDING,
    });
    await orch.applyTransitionIntent(
      'commit_on_fulfill',
      'ord-1',
      'ops',
      tx as never,
    );
    expect(reservations.commit).toHaveBeenCalledWith('res-1', 'ops', tx);
  });

  it('restock_on_post_fulfill_refund restocks COMMITTED reservation', async () => {
    const { orch, reservations, restock, tx } = build();
    reservations.findByOrderId.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.COMMITTED,
    });
    await orch.applyTransitionIntent(
      'restock_on_post_fulfill_refund',
      'ord-1',
      'ops',
      tx as never,
    );
    expect(restock.restockCommittedReservation).toHaveBeenCalledWith(
      'ord-1',
      'res-1',
      'ops',
      tx,
    );
  });

  it('override never reserves; commits only when PENDING → FULFILLED', async () => {
    const { orch, reservations, tx } = build();
    reservations.findByOrderId.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.PENDING,
    });
    await orch.applyOverrideInventory(
      OrderStatus.AWAITING_FULFILLMENT,
      OrderStatus.FULFILLED,
      'ord-1',
      'admin',
      tx as never,
    );
    expect(reservations.reserveForOrder).not.toHaveBeenCalled();
    expect(reservations.commit).toHaveBeenCalledWith('res-1', 'admin', tx);
  });

  it('override DRAFT → FULFILLED with no reservation is inventory no-op', async () => {
    const { orch, reservations, restock, tx } = build();
    reservations.findByOrderId.mockResolvedValue(null);
    await orch.applyOverrideInventory(
      OrderStatus.DRAFT,
      OrderStatus.FULFILLED,
      'ord-1',
      'admin',
      tx as never,
    );
    expect(reservations.commit).not.toHaveBeenCalled();
    expect(reservations.release).not.toHaveBeenCalled();
    expect(restock.restockCommittedReservation).not.toHaveBeenCalled();
  });

  it('override does not Release after COMMITTED (FULFILLED → CANCELLED)', async () => {
    const { orch, reservations, tx } = build();
    reservations.findByOrderId.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.COMMITTED,
    });
    await orch.applyOverrideInventory(
      OrderStatus.FULFILLED,
      OrderStatus.CANCELLED,
      'ord-1',
      'admin',
      tx as never,
    );
    expect(reservations.release).not.toHaveBeenCalled();
  });

  it('override FULFILLED → REFUNDED restocks COMMITTED', async () => {
    const { orch, reservations, restock, tx } = build();
    reservations.findByOrderId.mockResolvedValue({
      id: 'res-1',
      status: ReservationStatus.COMMITTED,
    });
    await orch.applyOverrideInventory(
      OrderStatus.FULFILLED,
      OrderStatus.REFUNDED,
      'ord-1',
      'admin',
      tx as never,
    );
    expect(restock.restockCommittedReservation).toHaveBeenCalled();
  });
});
