import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { RefundStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { AdminPaymentProvidersController } from './admin-payment-providers.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import {
  PROVIDER_CONFIG_RESPONSE_KEYS,
  RECONCILE_OUTCOMES,
} from './dto/payment.dto';
import {
  computeRefundReservation,
  isConfirmedRefundFailureCode,
} from './payments.service';

describe('Phase 7 Guardian payments', () => {
  describe('computeRefundReservation', () => {
    it('matches startRefund reservation rules (PENDING + uncertain FAILED)', () => {
      const result = computeRefundReservation(1000, [
        { amountCents: 200, status: RefundStatus.SUCCEEDED },
        { amountCents: 100, status: RefundStatus.PENDING },
        {
          amountCents: 50,
          status: RefundStatus.FAILED,
          errorCode: null,
        },
        {
          amountCents: 75,
          status: RefundStatus.FAILED,
          errorCode: ErrorCodes.PAY_REFUND_PROVIDER_FAILED,
        },
      ]);
      expect(result.refundedCents).toBe(200);
      expect(result.reservedRefundCents).toBe(150);
      expect(result.refundableCents).toBe(650);
      expect(
        isConfirmedRefundFailureCode(ErrorCodes.PAY_REFUND_PROVIDER_FAILED),
      ).toBe(true);
    });

    it('never overstates refundable vs reservation on the same rows', () => {
      const rows = [
        { amountCents: 400, status: RefundStatus.SUCCEEDED },
        { amountCents: 300, status: RefundStatus.PENDING },
      ];
      const { refundableCents, refundedCents, reservedRefundCents } =
        computeRefundReservation(1000, rows);
      expect(refundableCents).toBe(300);
      expect(refundableCents).toBeLessThanOrEqual(
        1000 - refundedCents - reservedRefundCents,
      );
      // Old detail formula (SUCCEEDED only) would overstate:
      expect(1000 - refundedCents).toBeGreaterThan(refundableCents);
    });

    it('partial + multiple refunds stay non-negative', () => {
      const result = computeRefundReservation(500, [
        { amountCents: 200, status: RefundStatus.SUCCEEDED },
        { amountCents: 200, status: RefundStatus.SUCCEEDED },
        { amountCents: 200, status: RefundStatus.PENDING },
      ]);
      expect(result.refundableCents).toBe(0);
      expect(result.refundedCents).toBe(400);
      expect(result.reservedRefundCents).toBe(200);
    });
  });

  describe('AdminPaymentsController.reconcile mapping', () => {
    const user = { id: 'staff-1' };

    it('returns allow-listed outcomes as 200 body', async () => {
      for (const outcome of RECONCILE_OUTCOMES) {
        const payments = {
          reconcilePaymentById: jest.fn().mockResolvedValue({
            paymentId: '11111111-1111-4111-8111-111111111111',
            outcome,
          }),
        };
        const controller = new AdminPaymentsController(payments as never);
        await expect(
          controller.reconcile(
            '11111111-1111-4111-8111-111111111111',
            user as never,
          ),
        ).resolves.toEqual({
          paymentId: '11111111-1111-4111-8111-111111111111',
          outcome,
        });
      }
    });

    it('maps not_found to 404', async () => {
      const payments = {
        reconcilePaymentById: jest.fn().mockResolvedValue({
          paymentId: '11111111-1111-4111-8111-111111111111',
          outcome: 'not_found',
        }),
      };
      const controller = new AdminPaymentsController(payments as never);
      await expect(
        controller.reconcile(
          '11111111-1111-4111-8111-111111111111',
          user as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps error and unknown outcomes to 5xx without leaking raw text', async () => {
      for (const outcome of ['error', 'stripe_boom_stack_trace']) {
        const payments = {
          reconcilePaymentById: jest.fn().mockResolvedValue({
            paymentId: '11111111-1111-4111-8111-111111111111',
            outcome,
          }),
        };
        const controller = new AdminPaymentsController(payments as never);
        await expect(
          controller.reconcile(
            '11111111-1111-4111-8111-111111111111',
            user as never,
          ),
        ).rejects.toMatchObject({
          response: {
            code: ErrorCodes.SYS_UNEXPECTED,
            message: 'Payment reconciliation failed',
          },
        });
        await expect(
          controller.reconcile(
            '11111111-1111-4111-8111-111111111111',
            user as never,
          ),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
      }
    });
  });

  describe('provider config allow-list', () => {
    it('returns only approved keys even if service internals grow', () => {
      const payments = {
        getProviderConfig: () => ({
          provider: 'simulated',
          mode: 'sandbox' as const,
          capabilities: ['authorize', 'capture'],
          webhookEndpointUrl: 'http://localhost/v1/webhooks/payments',
          stripeSecretKey: 'sk_test_should_not_leak',
          webhookSigningSecret: 'whsec_should_not_leak',
        }),
      };
      const controller = new AdminPaymentProvidersController(payments as never);
      const response = controller.get();
      expect(Object.keys(response).sort()).toEqual(
        [...PROVIDER_CONFIG_RESPONSE_KEYS].sort(),
      );
      expect(response).toEqual({
        provider: 'simulated',
        mode: 'sandbox',
        capabilities: ['authorize', 'capture'],
        webhookEndpointUrl: 'http://localhost/v1/webhooks/payments',
      });
      expect(response).not.toHaveProperty('stripeSecretKey');
      expect(response).not.toHaveProperty('webhookSigningSecret');
    });
  });
});
