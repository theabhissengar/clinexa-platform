import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
  RefundStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { isUuid } from '../../common/utils/search-query.util';
import { AdminPaymentProvidersController } from './admin-payment-providers.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import {
  PROVIDER_CONFIG_RESPONSE_KEYS,
  RECONCILE_OUTCOMES,
} from './dto/payment.dto';
import { PaymentProviderRegistry } from './payment-provider.registry';
import {
  computeRefundReservation,
  isConfirmedRefundFailureCode,
  PaymentsService,
} from './payments.service';
import { SimulatedPaymentAdapter } from './simulated-payment.adapter';

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

  describe('listPayments search (DEF-P1-001)', () => {
    const paymentId = 'a9274995-faaf-4a67-bf4a-7a0857fe43e5';
    let findMany: jest.Mock;
    let count: jest.Mock;
    let service: PaymentsService;

    beforeEach(() => {
      findMany = jest.fn().mockResolvedValue([]);
      count = jest.fn().mockResolvedValue(0);
      const prisma = {
        payment: { findMany, count },
      };
      const config = {
        get: jest.fn((key: string) => {
          if (key === 'payments.provider') return 'simulated';
          return undefined;
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'payments.webhookSecret') {
            return 'test-webhook-secret-16';
          }
          throw new Error(`missing ${key}`);
        }),
      } as unknown as ConfigService;
      const adapter = new SimulatedPaymentAdapter(config);
      const registry = new PaymentProviderRegistry(config);
      service = new PaymentsService(
        prisma as never,
        config,
        adapter,
        registry,
        null,
      );
    });

    function lastFindManyArgs(): {
      where: Record<string, unknown>;
      skip?: number;
      take?: number;
    } {
      expect(findMany).toHaveBeenCalled();
      const call = findMany.mock.calls[0] as
        | [{ where: Record<string, unknown>; skip?: number; take?: number }]
        | undefined;
      expect(call?.[0]).toBeDefined();
      return call![0];
    }

    function lastWhere(): Record<string, unknown> {
      return lastFindManyArgs().where;
    }

    function assertNoUuidEqualsOnNonUuid(q: string) {
      const where = lastWhere();
      const or = where.OR as Array<Record<string, unknown>>;
      expect(Array.isArray(or)).toBe(true);
      const idEquals = or.find(
        (clause) =>
          clause.id &&
          typeof clause.id === 'object' &&
          (clause.id as { equals?: string }).equals !== undefined,
      );
      if (isUuid(q)) {
        expect(idEquals).toEqual({ id: { equals: q.trim() } });
      } else {
        expect(idEquals).toBeUndefined();
      }
    }

    it('searches by valid payment UUID including id equality', async () => {
      await service.listPayments({ q: paymentId });
      assertNoUuidEqualsOnNonUuid(paymentId);
      const or = lastWhere().OR as Array<Record<string, unknown>>;
      expect(or).toEqual(
        expect.arrayContaining([
          { id: { equals: paymentId } },
          {
            providerPaymentRef: {
              contains: paymentId,
              mode: 'insensitive',
            },
          },
          {
            idempotencyKey: { contains: paymentId, mode: 'insensitive' },
          },
          {
            order: {
              orderNumber: { contains: paymentId, mode: 'insensitive' },
            },
          },
        ]),
      );
    });

    it('searches by order number without id UUID equality', async () => {
      const q = 'ORD-MWT6BX2T-95A5';
      await service.listPayments({ q });
      assertNoUuidEqualsOnNonUuid(q);
      expect(lastWhere().OR).toEqual(
        expect.arrayContaining([
          {
            order: { orderNumber: { contains: q, mode: 'insensitive' } },
          },
        ]),
      );
    });

    it('searches by provider payment reference without id UUID equality', async () => {
      const q = 'sim_68edafab5b34423ce7cee714';
      await service.listPayments({ q });
      assertNoUuidEqualsOnNonUuid(q);
      expect(lastWhere().OR).toEqual(
        expect.arrayContaining([
          {
            providerPaymentRef: { contains: q, mode: 'insensitive' },
          },
        ]),
      );
    });

    it('searches by idempotency key without id UUID equality', async () => {
      const q = 'QA_PHASE6_7_co_a_example';
      await service.listPayments({ q });
      assertNoUuidEqualsOnNonUuid(q);
      expect(lastWhere().OR).toEqual(
        expect.arrayContaining([
          { idempotencyKey: { contains: q, mode: 'insensitive' } },
        ]),
      );
    });

    it('searches ordinary text with no matches without Prisma UUID parse risk', async () => {
      const q = 'QA';
      await service.listPayments({ q });
      assertNoUuidEqualsOnNonUuid(q);
      expect(count).toHaveBeenCalled();
    });

    it('omits OR when q is empty or omitted', async () => {
      await service.listPayments({});
      expect(lastWhere().OR).toBeUndefined();

      findMany.mockClear();
      count.mockClear();
      await service.listPayments({ q: '   ' });
      expect(lastWhere().OR).toBeUndefined();
    });

    it('applies pagination skip/take (capped at 100)', async () => {
      await service.listPayments({ skip: 10, take: 1000 });
      const args = lastFindManyArgs();
      expect(args.skip).toBe(10);
      expect(args.take).toBe(100);
    });

    it('combines search with existing filters', async () => {
      const q = 'ORD-SEED';
      await service.listPayments({
        q,
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        provider: 'simulated',
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
      });
      const where = lastWhere();
      assertNoUuidEqualsOnNonUuid(q);
      expect(where.status).toBe(PaymentStatus.AUTHORIZED_OR_CAPTURED);
      expect(where.provider).toBe('simulated');
      expect(where.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);
      expect(where.purpose).toBe(PaymentPurpose.CHECKOUT);
    });

    it('treats invalid UUID-like text as contains-only search', async () => {
      const q = 'a9274995-faaf-4a67-bf4a-7a0857fe43e'; // truncated
      expect(isUuid(q)).toBe(false);
      await service.listPayments({ q });
      assertNoUuidEqualsOnNonUuid(q);
    });

    it('accepts unusually long search input without id UUID equality', async () => {
      const q = `ORD-${'X'.repeat(500)}`;
      await service.listPayments({ q });
      assertNoUuidEqualsOnNonUuid(q);
      expect(lastWhere().OR).toEqual(
        expect.arrayContaining([
          {
            order: { orderNumber: { contains: q, mode: 'insensitive' } },
          },
        ]),
      );
    });
  });
});
