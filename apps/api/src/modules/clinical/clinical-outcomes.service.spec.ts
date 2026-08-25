import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { OrdersService } from '../orders/orders.service';
import { ClinicalOutcomesService } from './clinical-outcomes.service';

type OrderFixture = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderType: string;
  totalCents: number;
  currency: string;
  subscriptionId: string;
  consultationId: string | null;
  prescriptionId: string | null;
  questionnaireResponseId: string | null;
  questionnaireVersionId: string | null;
  requiresClinicalReview: boolean;
  isRxOrder: boolean;
  updatedAt: Date;
};

describe('ClinicalOutcomesService (P14g)', () => {
  function build(overrides?: {
    order?: Partial<OrderFixture> | null;
    transition?: jest.Mock;
  }) {
    const order: OrderFixture = {
      id: 'ord-1',
      orderNumber: 'ORD-1',
      status: OrderStatus.AWAITING_CLINICAL_REVIEW,
      orderType: 'SUBSCRIPTION_RENEWAL',
      totalCents: 1000,
      currency: 'USD',
      subscriptionId: 'sub-1',
      consultationId: 'cons-1',
      prescriptionId: null,
      questionnaireResponseId: null,
      questionnaireVersionId: null,
      requiresClinicalReview: true,
      isRxOrder: true,
      updatedAt: new Date(),
      ...(overrides?.order === null ? {} : (overrides?.order ?? {})),
    };

    const orders = {
      getOrderById: jest.fn().mockResolvedValue(order),
      findByConsultationId: jest.fn().mockImplementation(() => {
        if (overrides?.order === null) {
          return Promise.reject(
            new NotFoundException({
              code: ErrorCodes.ORD_NOT_FOUND,
              message: 'Order not found for consultation reference',
            }),
          );
        }
        return Promise.resolve(order);
      }),
      attachClinicalRefs: jest
        .fn()
        .mockImplementation((input: { consultationId?: string | null }) =>
          Promise.resolve({
            ...order,
            consultationId: input.consultationId ?? order.consultationId,
          }),
        ),
      transitionOrder:
        overrides?.transition ??
        jest.fn().mockImplementation((input: { toStatus: OrderStatus }) =>
          Promise.resolve({
            ...order,
            status: input.toStatus,
          }),
        ),
    };

    const service = new ClinicalOutcomesService(
      orders as unknown as OrdersService,
    );
    return { service, orders, order };
  }

  it('ensureOpaqueConsultationRef returns existing id', async () => {
    const { service, orders } = build();
    const id = await service.ensureOpaqueConsultationRef('ord-1');
    expect(id).toBe('cons-1');
    expect(orders.attachClinicalRefs).not.toHaveBeenCalled();
  });

  it('ensureOpaqueConsultationRef mints when null', async () => {
    const { service, orders } = build({
      order: { consultationId: null },
    });
    const id = await service.ensureOpaqueConsultationRef('ord-1');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(orders.attachClinicalRefs).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        consultationId: id,
        source: 'clinical',
      }),
    );
  });

  it('approve runs CLINICAL_APPROVED then AWAITING_FULFILLMENT with source clinical', async () => {
    const { service, orders } = build();
    const result = await service.approve({
      consultationId: 'cons-1',
      actorUserId: 'doc-1',
      reason: 'ok',
    });
    expect(orders.transitionOrder).toHaveBeenCalledTimes(2);
    expect(orders.transitionOrder).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toStatus: OrderStatus.CLINICAL_APPROVED,
        source: 'clinical',
        expectedStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
      }),
    );
    expect(orders.transitionOrder).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toStatus: OrderStatus.AWAITING_FULFILLMENT,
        source: 'clinical',
        expectedStatus: OrderStatus.CLINICAL_APPROVED,
      }),
    );
    expect(result.status).toBe(OrderStatus.AWAITING_FULFILLMENT);
  });

  it('duplicate approve on AWAITING_FULFILLMENT is idempotent', async () => {
    const { service, orders } = build({
      order: { status: OrderStatus.AWAITING_FULFILLMENT },
    });
    const result = await service.approve({
      consultationId: 'cons-1',
      actorUserId: 'doc-1',
    });
    expect(orders.transitionOrder).not.toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.AWAITING_FULFILLMENT);
  });

  it('approve after CLINICAL_APPROVED resumes capture transition only', async () => {
    const { service, orders } = build({
      order: { status: OrderStatus.CLINICAL_APPROVED },
    });
    await service.approve({
      consultationId: 'cons-1',
      actorUserId: 'doc-1',
    });
    expect(orders.transitionOrder).toHaveBeenCalledTimes(1);
    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.AWAITING_FULFILLMENT,
        expectedStatus: OrderStatus.CLINICAL_APPROVED,
        source: 'clinical',
      }),
    );
  });

  it('approve after decline is rejected', async () => {
    const { service } = build({
      order: { status: OrderStatus.CLINICAL_DECLINED },
    });
    await expect(
      service.approve({ consultationId: 'cons-1', actorUserId: 'doc-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decline transitions to CLINICAL_DECLINED', async () => {
    const { service, orders } = build();
    const result = await service.decline({
      consultationId: 'cons-1',
      actorUserId: 'doc-1',
      reason: 'not indicated',
    });
    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.CLINICAL_DECLINED,
        source: 'clinical',
        expectedStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
      }),
    );
    expect(result.status).toBe(OrderStatus.CLINICAL_DECLINED);
  });

  it('duplicate decline is idempotent', async () => {
    const { service, orders } = build({
      order: { status: OrderStatus.CLINICAL_DECLINED },
    });
    const result = await service.decline({
      consultationId: 'cons-1',
      actorUserId: 'doc-1',
    });
    expect(orders.transitionOrder).not.toHaveBeenCalled();
    expect(result.status).toBe(OrderStatus.CLINICAL_DECLINED);
  });

  it('decline after approve is rejected', async () => {
    const { service } = build({
      order: { status: OrderStatus.CLINICAL_APPROVED },
    });
    await expect(
      service.decline({ consultationId: 'cons-1', actorUserId: 'doc-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-clinical order', async () => {
    const { service } = build({
      order: {
        requiresClinicalReview: false,
        isRxOrder: false,
      },
    });
    await expect(
      service.approve({ consultationId: 'cons-1', actorUserId: 'doc-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('invalid consultationId propagates not found', async () => {
    const { service } = build({ order: null });
    await expect(
      service.approve({ consultationId: 'missing', actorUserId: 'doc-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
