import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import type {
  OrderInventoryHookEvent,
  OrderPaymentHookEvent,
} from './order-side-effects';

/**
 * Canonical OR-08 allowed transitions (docs/10 §15.1 / docs/35).
 */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_PENDING]: [
    OrderStatus.AWAITING_CLINICAL_REVIEW,
    OrderStatus.AWAITING_FULFILLMENT,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.AWAITING_CLINICAL_REVIEW]: [
    OrderStatus.CLINICAL_APPROVED,
    OrderStatus.CLINICAL_DECLINED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CLINICAL_APPROVED]: [
    OrderStatus.AWAITING_FULFILLMENT,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CLINICAL_DECLINED]: [
    OrderStatus.REFUNDED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.AWAITING_FULFILLMENT]: [
    OrderStatus.FULFILLED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ],
  [OrderStatus.FULFILLED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
};

const TERMINAL: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.FULFILLED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

@Injectable()
export class OrderLifecycleService {
  assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (from === to) {
      return;
    }
    if (!ALLOWED[from].includes(to)) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message: `Invalid order lifecycle transition: ${from} → ${to}`,
      });
    }
  }

  isTerminal(status: OrderStatus): boolean {
    return TERMINAL.has(status);
  }

  isAllowed(from: OrderStatus, to: OrderStatus): boolean {
    if (from === to) {
      return true;
    }
    return ALLOWED[from].includes(to);
  }

  /** Allowed next statuses for a given current status (excluding self). */
  allowedNext(from: OrderStatus): OrderStatus[] {
    return [...ALLOWED[from]];
  }

  /**
   * Inventory hook intent for a completed transition (P13e will execute).
   * Reserve-at-auth policy (docs/35 §10).
   */
  inventoryHookForTransition(
    from: OrderStatus,
    to: OrderStatus,
  ): OrderInventoryHookEvent | null {
    if (
      from === OrderStatus.PAYMENT_PENDING &&
      (to === OrderStatus.AWAITING_CLINICAL_REVIEW ||
        to === OrderStatus.AWAITING_FULFILLMENT)
    ) {
      return 'reserve_on_auth_success';
    }
    if (
      to === OrderStatus.CANCELLED ||
      to === OrderStatus.CLINICAL_DECLINED ||
      (to === OrderStatus.REFUNDED && from !== OrderStatus.FULFILLED)
    ) {
      return 'release_on_cancel_or_decline';
    }
    if (to === OrderStatus.FULFILLED) {
      return 'commit_on_fulfill';
    }
    if (from === OrderStatus.FULFILLED && to === OrderStatus.REFUNDED) {
      return 'restock_on_post_fulfill_refund';
    }
    return null;
  }

  /** Payment hook intent (P13f will execute). No PSP calls here. */
  paymentHookForTransition(
    from: OrderStatus,
    to: OrderStatus,
  ): OrderPaymentHookEvent | null {
    if (
      from === OrderStatus.PAYMENT_PENDING &&
      (to === OrderStatus.AWAITING_CLINICAL_REVIEW ||
        to === OrderStatus.AWAITING_FULFILLMENT)
    ) {
      return 'authorization_recorded';
    }
    if (
      from === OrderStatus.CLINICAL_APPROVED &&
      to === OrderStatus.AWAITING_FULFILLMENT
    ) {
      return 'capture_required';
    }
    if (
      to === OrderStatus.REFUNDED ||
      to === OrderStatus.CLINICAL_DECLINED ||
      (to === OrderStatus.CANCELLED && from !== OrderStatus.DRAFT)
    ) {
      return 'void_or_refund_required';
    }
    return null;
  }
}
