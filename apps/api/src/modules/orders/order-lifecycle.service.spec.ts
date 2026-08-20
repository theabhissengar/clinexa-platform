import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { OrderLifecycleService } from './order-lifecycle.service';

describe('OrderLifecycleService', () => {
  const service = new OrderLifecycleService();

  it('allows the canonical happy paths', () => {
    expect(() =>
      service.assertTransition(OrderStatus.DRAFT, OrderStatus.PAYMENT_PENDING),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        OrderStatus.PAYMENT_PENDING,
        OrderStatus.AWAITING_CLINICAL_REVIEW,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        OrderStatus.PAYMENT_PENDING,
        OrderStatus.AWAITING_FULFILLMENT,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        OrderStatus.AWAITING_CLINICAL_REVIEW,
        OrderStatus.CLINICAL_APPROVED,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        OrderStatus.CLINICAL_APPROVED,
        OrderStatus.AWAITING_FULFILLMENT,
      ),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(
        OrderStatus.AWAITING_FULFILLMENT,
        OrderStatus.FULFILLED,
      ),
    ).not.toThrow();
  });

  it('rejects illegal and terminal reopen transitions', () => {
    const illegal: Array<[OrderStatus, OrderStatus]> = [
      [OrderStatus.DRAFT, OrderStatus.FULFILLED],
      [OrderStatus.DRAFT, OrderStatus.AWAITING_CLINICAL_REVIEW],
      [OrderStatus.PAYMENT_PENDING, OrderStatus.FULFILLED],
      [OrderStatus.AWAITING_CLINICAL_REVIEW, OrderStatus.AWAITING_FULFILLMENT],
      [OrderStatus.CLINICAL_DECLINED, OrderStatus.FULFILLED],
      [OrderStatus.CLINICAL_DECLINED, OrderStatus.CLINICAL_APPROVED],
      [OrderStatus.FULFILLED, OrderStatus.AWAITING_CLINICAL_REVIEW],
      [OrderStatus.REFUNDED, OrderStatus.FULFILLED],
      [OrderStatus.CANCELLED, OrderStatus.FULFILLED],
      [OrderStatus.FULFILLED, OrderStatus.DRAFT],
    ];

    for (const [from, to] of illegal) {
      try {
        service.assertTransition(from, to);
        fail(`expected ${from} → ${to} to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: ErrorCodes.ORD_INVALID_TRANSITION,
        });
      }
    }
  });

  it('marks fulfilled/cancelled/refunded as terminal', () => {
    expect(service.isTerminal(OrderStatus.FULFILLED)).toBe(true);
    expect(service.isTerminal(OrderStatus.CANCELLED)).toBe(true);
    expect(service.isTerminal(OrderStatus.REFUNDED)).toBe(true);
    expect(service.isTerminal(OrderStatus.DRAFT)).toBe(false);
  });

  it('maps inventory hooks for reserve-at-auth policy', () => {
    expect(
      service.inventoryHookForTransition(
        OrderStatus.PAYMENT_PENDING,
        OrderStatus.AWAITING_CLINICAL_REVIEW,
      ),
    ).toBe('reserve_on_auth_success');
    expect(
      service.inventoryHookForTransition(
        OrderStatus.AWAITING_FULFILLMENT,
        OrderStatus.FULFILLED,
      ),
    ).toBe('commit_on_fulfill');
    expect(
      service.inventoryHookForTransition(
        OrderStatus.FULFILLED,
        OrderStatus.REFUNDED,
      ),
    ).toBe('restock_on_post_fulfill_refund');
    expect(
      service.inventoryHookForTransition(
        OrderStatus.AWAITING_CLINICAL_REVIEW,
        OrderStatus.CLINICAL_DECLINED,
      ),
    ).toBe('release_on_cancel_or_decline');
  });
});
