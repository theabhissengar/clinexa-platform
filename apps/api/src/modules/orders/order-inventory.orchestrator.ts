import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ReservationStatus,
} from '../../../generated/prisma';

import { InventoryReservationService } from '../inventory/inventory-reservation.service';
import { InventoryRestockService } from '../inventory/inventory-stock-ops.service';
import type { OrderInventoryHookEvent } from './order-side-effects';

type Tx = Prisma.TransactionClient;

/**
 * P13e: Orders → Inventory orchestration. Calls Inventory services only;
 * never writes inventory tables via Prisma from this module.
 */
@Injectable()
export class OrderInventoryOrchestrator {
  constructor(
    private readonly reservations: InventoryReservationService,
    private readonly restock: InventoryRestockService,
  ) {}

  /**
   * Execute inventory intent for a normal lifecycle transition (Reserve-at-auth).
   */
  async applyTransitionIntent(
    event: OrderInventoryHookEvent,
    orderId: string,
    actorUserId: string | undefined,
    tx: Tx,
  ): Promise<void> {
    switch (event) {
      case 'reserve_on_auth_success':
        await this.reserveForOrder(orderId, actorUserId, tx);
        return;
      case 'release_on_cancel_or_decline':
        await this.releaseIfPending(orderId, actorUserId, tx);
        return;
      case 'commit_on_fulfill':
        await this.commitIfPending(orderId, actorUserId, tx);
        return;
      case 'restock_on_post_fulfill_refund':
        await this.restockIfCommitted(orderId, actorUserId, tx);
        return;
      default:
        return;
    }
  }

  /**
   * Class D override: reservation-state gated. Never Reserves.
   * Commit/Release/Restock only when reservation state matches.
   */
  async applyOverrideInventory(
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    orderId: string,
    actorUserId: string | undefined,
    tx: Tx,
  ): Promise<void> {
    const reservation = await this.reservations.findByOrderId(orderId, tx);

    if (
      toStatus === OrderStatus.FULFILLED &&
      reservation?.status === ReservationStatus.PENDING
    ) {
      await this.reservations.commit(reservation.id, actorUserId, tx);
      return;
    }

    if (
      (toStatus === OrderStatus.CANCELLED ||
        toStatus === OrderStatus.CLINICAL_DECLINED ||
        (toStatus === OrderStatus.REFUNDED &&
          fromStatus !== OrderStatus.FULFILLED)) &&
      reservation?.status === ReservationStatus.PENDING
    ) {
      await this.reservations.release(reservation.id, actorUserId, tx);
      return;
    }

    if (
      fromStatus === OrderStatus.FULFILLED &&
      toStatus === OrderStatus.REFUNDED &&
      reservation?.status === ReservationStatus.COMMITTED
    ) {
      await this.restock.restockCommittedReservation(
        orderId,
        reservation.id,
        actorUserId,
        tx,
      );
    }
    // Otherwise inventory no-op.
  }

  private async reserveForOrder(
    orderId: string,
    actorUserId: string | undefined,
    tx: Tx,
  ): Promise<void> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      return;
    }

    const reservation = await this.reservations.reserveForOrder(
      orderId,
      order.items.map((item) => ({
        productVariantId: item.variantId,
        quantity: item.quantity,
      })),
      actorUserId,
      tx,
    );

    if (reservation && order.reservationId !== reservation.id) {
      await tx.order.update({
        where: { id: orderId },
        data: { reservationId: reservation.id },
      });
    }
  }

  private async releaseIfPending(
    orderId: string,
    actorUserId: string | undefined,
    tx: Tx,
  ): Promise<void> {
    const reservation = await this.reservations.findByOrderId(orderId, tx);
    if (!reservation || reservation.status !== ReservationStatus.PENDING) {
      return;
    }
    await this.reservations.release(reservation.id, actorUserId, tx);
  }

  private async commitIfPending(
    orderId: string,
    actorUserId: string | undefined,
    tx: Tx,
  ): Promise<void> {
    const reservation = await this.reservations.findByOrderId(orderId, tx);
    if (!reservation) {
      return;
    }
    if (reservation.status === ReservationStatus.COMMITTED) {
      return;
    }
    if (reservation.status !== ReservationStatus.PENDING) {
      return;
    }
    await this.reservations.commit(reservation.id, actorUserId, tx);
  }

  private async restockIfCommitted(
    orderId: string,
    actorUserId: string | undefined,
    tx: Tx,
  ): Promise<void> {
    const reservation = await this.reservations.findByOrderId(orderId, tx);
    if (!reservation || reservation.status !== ReservationStatus.COMMITTED) {
      return;
    }
    await this.restock.restockCommittedReservation(
      orderId,
      reservation.id,
      actorUserId,
      tx,
    );
  }
}
