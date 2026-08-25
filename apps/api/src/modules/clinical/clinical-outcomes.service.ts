import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { OrdersService } from '../orders/orders.service';

/**
 * P14g Clinical integration adapter / event sink.
 * Resolves Orders by opaque consultationId, attaches opaque refs, and drives
 * Orders lifecycle transitions. NOT the source of truth for clinical records —
 * no Consultation / Questionnaire / Prescription persistence.
 */
@Injectable()
export class ClinicalOutcomesService {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Mint an opaque correlation UUID when Order.consultationId is null.
   * Future Clinical SoT replaces this with a real Consultation.id.
   */
  async ensureOpaqueConsultationRef(orderId: string): Promise<string> {
    const order = await this.orders.getOrderById(orderId);
    if (order.consultationId) {
      return order.consultationId;
    }
    const consultationId = randomUUID();
    await this.orders.attachClinicalRefs({
      orderId,
      consultationId,
      source: 'clinical',
    });
    return consultationId;
  }

  async approve(input: {
    consultationId: string;
    actorUserId: string;
    reason?: string | null;
  }) {
    const order = await this.resolveClinicalOrder(input.consultationId);

    if (
      order.status === OrderStatus.AWAITING_FULFILLMENT ||
      order.status === OrderStatus.FULFILLED
    ) {
      return this.toDecisionResponse(order);
    }

    if (order.status === OrderStatus.CLINICAL_DECLINED) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message: 'Cannot approve a clinically declined order',
      });
    }

    if (order.status === OrderStatus.CLINICAL_APPROVED) {
      const advanced = await this.orders.transitionOrder({
        orderId: order.id,
        toStatus: OrderStatus.AWAITING_FULFILLMENT,
        actorUserId: input.actorUserId,
        source: 'clinical',
        reason: input.reason ?? 'clinical_approve_resume_capture',
        expectedStatus: OrderStatus.CLINICAL_APPROVED,
      });
      return this.toDecisionResponse(advanced);
    }

    if (order.status !== OrderStatus.AWAITING_CLINICAL_REVIEW) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message: `Order is not awaiting clinical review (status=${order.status})`,
      });
    }

    await this.ensureOpaqueConsultationRef(order.id);

    await this.orders.transitionOrder({
      orderId: order.id,
      toStatus: OrderStatus.CLINICAL_APPROVED,
      actorUserId: input.actorUserId,
      source: 'clinical',
      reason: input.reason ?? 'clinical_approve',
      expectedStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
    });

    const fulfilled = await this.orders.transitionOrder({
      orderId: order.id,
      toStatus: OrderStatus.AWAITING_FULFILLMENT,
      actorUserId: input.actorUserId,
      source: 'clinical',
      reason: input.reason ?? 'clinical_approve_capture',
      expectedStatus: OrderStatus.CLINICAL_APPROVED,
    });

    return this.toDecisionResponse(fulfilled);
  }

  async decline(input: {
    consultationId: string;
    actorUserId: string;
    reason?: string | null;
  }) {
    const order = await this.resolveClinicalOrder(input.consultationId);

    if (order.status === OrderStatus.CLINICAL_DECLINED) {
      return this.toDecisionResponse(order);
    }

    if (
      order.status === OrderStatus.CLINICAL_APPROVED ||
      order.status === OrderStatus.AWAITING_FULFILLMENT ||
      order.status === OrderStatus.FULFILLED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message: 'Cannot decline after clinical approval / fulfillment path',
      });
    }

    if (order.status !== OrderStatus.AWAITING_CLINICAL_REVIEW) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message: `Order is not awaiting clinical review (status=${order.status})`,
      });
    }

    await this.ensureOpaqueConsultationRef(order.id);

    const declined = await this.orders.transitionOrder({
      orderId: order.id,
      toStatus: OrderStatus.CLINICAL_DECLINED,
      actorUserId: input.actorUserId,
      source: 'clinical',
      reason: input.reason ?? 'clinical_decline',
      expectedStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
    });

    return this.toDecisionResponse(declined);
  }

  private async resolveClinicalOrder(consultationId: string) {
    const order = await this.orders.findByConsultationId(consultationId);
    if (!order.requiresClinicalReview && !order.isRxOrder) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message: 'Consultation reference does not belong to a clinical order',
      });
    }
    return order;
  }

  private toDecisionResponse(order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    orderType: string;
    totalCents: number;
    currency: string;
    subscriptionId?: string | null;
    consultationId?: string | null;
    prescriptionId?: string | null;
    questionnaireResponseId?: string | null;
    questionnaireVersionId?: string | null;
    requiresClinicalReview?: boolean;
    isRxOrder?: boolean;
    updatedAt: Date;
  }) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderType: order.orderType,
      totalCents: order.totalCents,
      currency: order.currency,
      subscriptionId: order.subscriptionId ?? null,
      consultationId: order.consultationId ?? null,
      prescriptionId: order.prescriptionId ?? null,
      questionnaireResponseId: order.questionnaireResponseId ?? null,
      questionnaireVersionId: order.questionnaireVersionId ?? null,
      requiresClinicalReview: order.requiresClinicalReview ?? false,
      isRxOrder: order.isRxOrder ?? false,
      updatedAt: order.updatedAt,
    };
  }
}
