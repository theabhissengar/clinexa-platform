import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';

import { ErrorCodes } from '../../common/constants/error-codes';
import type { PaymentGateway } from './payment.gateway';
import type {
  GatewayAuthorizeInput,
  GatewayAuthorizeResult,
  GatewayCancelRecurringInput,
  GatewayCancelRecurringResult,
  GatewayCaptureInput,
  GatewayCaptureResult,
  GatewayListedRefund,
  GatewayListRefundsResult,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayRetrieveInput,
  GatewayRetrieveResult,
  GatewayVoidInput,
  GatewayVoidResult,
  GatewayWebhookVerifyInput,
} from './payment.types';

type SimOpRecord = {
  operation: 'authorization' | 'capture' | 'refund' | 'void';
  outcomeClass: GatewayRetrieveResult['outcomeClass'];
  lifecycleHint?: GatewayRetrieveResult['lifecycleHint'];
  providerPaymentRef?: string;
  providerAuthorizationRef?: string;
  providerCaptureRef?: string;
  providerRefundRef?: string;
  authorizationExpiresAt?: Date;
  amountCents?: number;
};

/**
 * Deterministic sandbox adapter (PAY-029). No Stripe SDK.
 * In-memory op map supports Phase 6B retrieve/reconcile tests (sim-only).
 */
@Injectable()
export class SimulatedPaymentAdapter implements PaymentGateway {
  /** Sim-only: keyed by idempotencyKey and by provider refs. */
  private readonly opsByKey = new Map<string, SimOpRecord>();
  private readonly opsByRef = new Map<string, SimOpRecord>();

  constructor(private readonly config: ConfigService) {}

  private force(
    inputForce?: 'decline' | 'timeout' | 'action_required' | null,
  ): 'decline' | 'timeout' | 'action_required' | null {
    if (inputForce) {
      return inputForce;
    }
    const fromEnv = this.config.get<string | null>('payments.simulatedForce');
    if (
      fromEnv === 'decline' ||
      fromEnv === 'timeout' ||
      fromEnv === 'action_required'
    ) {
      return fromEnv;
    }
    return null;
  }

  private holdHours(): number {
    const raw = this.config.get<number>('payments.simulatedAuthHoldHours');
    return typeof raw === 'number' && raw > 0 ? raw : 168;
  }

  private stableRef(prefix: string, idempotencyKey: string): string {
    const hash = createHash('sha256')
      .update(idempotencyKey)
      .digest('hex')
      .slice(0, 24);
    return `sim_${prefix}_${hash}`;
  }

  private remember(key: string, record: SimOpRecord): void {
    this.opsByKey.set(key, record);
    if (record.providerPaymentRef) {
      this.opsByRef.set(record.providerPaymentRef, record);
    }
    if (record.providerAuthorizationRef) {
      this.opsByRef.set(record.providerAuthorizationRef, record);
    }
    if (record.providerCaptureRef) {
      this.opsByRef.set(record.providerCaptureRef, record);
    }
    if (record.providerRefundRef) {
      this.opsByRef.set(record.providerRefundRef, record);
    }
  }

  /** Test helper: clear in-memory sim state. */
  clearSimState(): void {
    this.opsByKey.clear();
    this.opsByRef.clear();
  }

  authorize(input: GatewayAuthorizeInput): Promise<GatewayAuthorizeResult> {
    const force = this.force(input.forceOutcome);
    if (force === 'timeout') {
      this.remember(input.idempotencyKey, {
        operation: 'authorization',
        outcomeClass: 'TIMEOUT',
        lifecycleHint: 'PENDING',
      });
      return Promise.resolve({
        success: false,
        outcomeClass: 'TIMEOUT',
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated provider timeout',
      });
    }
    if (force === 'decline') {
      this.remember(input.idempotencyKey, {
        operation: 'authorization',
        outcomeClass: 'CONFIRMED_FAILURE',
        lifecycleHint: 'AUTHORIZATION_FAILED',
      });
      return Promise.resolve({
        success: false,
        outcomeClass: 'CONFIRMED_FAILURE',
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        errorMessage: 'Simulated authorization declined',
      });
    }
    if (force === 'action_required') {
      const providerPaymentRef = this.stableRef('pi', input.idempotencyKey);
      this.remember(input.idempotencyKey, {
        operation: 'authorization',
        outcomeClass: 'ACTION_REQUIRED',
        lifecycleHint: 'PENDING',
        providerPaymentRef,
        providerAuthorizationRef: providerPaymentRef,
      });
      return Promise.resolve({
        success: false,
        outcomeClass: 'ACTION_REQUIRED',
        providerPaymentRef,
        providerAuthorizationRef: providerPaymentRef,
        providerStatusRaw: 'requires_action',
        // Simulated has no Stripe client_secret — checkout mapper omits secret.
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated payment requires customer action',
      });
    }
    const providerPaymentRef = this.stableRef('pay', input.idempotencyKey);
    const providerAuthorizationRef = this.stableRef(
      'auth',
      input.idempotencyKey,
    );
    const authorizationExpiresAt = new Date(
      Date.now() + this.holdHours() * 60 * 60 * 1000,
    );
    this.remember(input.idempotencyKey, {
      operation: 'authorization',
      outcomeClass: 'SUCCESS',
      lifecycleHint: 'AUTHORIZED',
      providerPaymentRef,
      providerAuthorizationRef,
      authorizationExpiresAt,
    });
    return Promise.resolve({
      success: true,
      outcomeClass: 'SUCCESS',
      providerPaymentRef,
      providerAuthorizationRef,
      authorizationExpiresAt,
      providerStatusRaw: 'authorized',
    });
  }

  capture(input: GatewayCaptureInput): Promise<GatewayCaptureResult> {
    const force = this.force(input.forceOutcome);
    if (force === 'timeout') {
      this.remember(input.idempotencyKey, {
        operation: 'capture',
        outcomeClass: 'TIMEOUT',
        lifecycleHint: 'PENDING',
        providerPaymentRef: input.providerPaymentRef,
        providerAuthorizationRef: input.providerAuthorizationRef,
      });
      return Promise.resolve({
        success: false,
        outcomeClass: 'TIMEOUT',
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated capture timeout',
      });
    }
    if (force === 'decline') {
      this.remember(input.idempotencyKey, {
        operation: 'capture',
        outcomeClass: 'CONFIRMED_FAILURE',
        lifecycleHint: 'CAPTURE_FAILED',
        providerPaymentRef: input.providerPaymentRef,
        providerAuthorizationRef: input.providerAuthorizationRef,
      });
      return Promise.resolve({
        success: false,
        outcomeClass: 'CONFIRMED_FAILURE',
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        errorMessage: 'Simulated capture declined',
      });
    }
    const providerCaptureRef = this.stableRef('cap', input.idempotencyKey);
    this.remember(input.idempotencyKey, {
      operation: 'capture',
      outcomeClass: 'SUCCESS',
      lifecycleHint: 'CAPTURED',
      providerPaymentRef: input.providerPaymentRef,
      providerAuthorizationRef: input.providerAuthorizationRef,
      providerCaptureRef,
    });
    return Promise.resolve({
      success: true,
      outcomeClass: 'SUCCESS',
      providerCaptureRef,
      providerStatusRaw: 'captured',
    });
  }

  void(input: GatewayVoidInput): Promise<GatewayVoidResult> {
    const force = this.force(input.forceOutcome);
    if (force === 'timeout') {
      return Promise.resolve({
        success: false,
        outcomeClass: 'TIMEOUT',
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated void timeout',
      });
    }
    this.remember(input.idempotencyKey, {
      operation: 'void',
      outcomeClass: 'SUCCESS',
      lifecycleHint: 'VOIDED',
      providerPaymentRef: input.providerPaymentRef,
      providerAuthorizationRef: input.providerAuthorizationRef,
    });
    return Promise.resolve({ success: true, outcomeClass: 'SUCCESS' });
  }

  refund(input: GatewayRefundInput): Promise<GatewayRefundResult> {
    const force = this.force(input.forceOutcome);
    const key = input.idempotencyKey || randomUUID();
    const providerRefundRef = this.stableRef('ref', key);
    if (force === 'timeout') {
      // Ambiguous but provider often already created a refund — expose ref (D1).
      this.remember(key, {
        operation: 'refund',
        outcomeClass: 'TIMEOUT',
        lifecycleHint: 'PENDING',
        providerPaymentRef: input.providerPaymentRef,
        providerCaptureRef: input.providerCaptureRef,
        providerRefundRef,
        amountCents: input.amountCents,
      });
      return Promise.resolve({
        success: false,
        outcomeClass: 'TIMEOUT',
        providerRefundRef,
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated refund timeout',
      });
    }
    if (force === 'decline') {
      this.remember(key, {
        operation: 'refund',
        outcomeClass: 'CONFIRMED_FAILURE',
        lifecycleHint: 'REFUND_FAILED',
        providerPaymentRef: input.providerPaymentRef,
        providerCaptureRef: input.providerCaptureRef,
        providerRefundRef,
        amountCents: input.amountCents,
      });
      return Promise.resolve({
        success: false,
        outcomeClass: 'CONFIRMED_FAILURE',
        providerRefundRef,
        errorCode: ErrorCodes.PAY_REFUND_INELIGIBLE,
        errorMessage: 'Simulated refund declined',
      });
    }
    this.remember(key, {
      operation: 'refund',
      outcomeClass: 'SUCCESS',
      lifecycleHint: 'REFUNDED',
      providerPaymentRef: input.providerPaymentRef,
      providerCaptureRef: input.providerCaptureRef,
      providerRefundRef,
      amountCents: input.amountCents,
    });
    return Promise.resolve({
      success: true,
      outcomeClass: 'SUCCESS',
      providerRefundRef,
    });
  }

  cancelRecurring(
    input: GatewayCancelRecurringInput,
  ): Promise<GatewayCancelRecurringResult> {
    void input;
    // No simulated Billing — callers must not treat this as PSP cancel success.
    return Promise.resolve({
      ok: false,
      unsupported: true,
      errorCode: ErrorCodes.PAY_UNSUPPORTED_OPERATION,
      errorMessage: 'Simulated adapter does not support recurring cancellation',
    });
  }

  verifyWebhook(input: GatewayWebhookVerifyInput): boolean {
    if (!input.secretHeader || !input.expectedSecret) {
      return false;
    }
    const left = Buffer.from(input.secretHeader, 'utf8');
    const right = Buffer.from(input.expectedSecret, 'utf8');
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  retrieveAuthorization(
    input: GatewayRetrieveInput,
  ): Promise<GatewayRetrieveResult> {
    return Promise.resolve(this.lookup(input, 'authorization'));
  }

  retrieveCapture(input: GatewayRetrieveInput): Promise<GatewayRetrieveResult> {
    return Promise.resolve(this.lookup(input, 'capture'));
  }

  retrieveRefund(input: GatewayRetrieveInput): Promise<GatewayRetrieveResult> {
    return Promise.resolve(this.lookup(input, 'refund'));
  }

  listRefundsByPaymentRef(input: {
    providerPaymentRef: string;
  }): Promise<GatewayListRefundsResult> {
    const seen = new Set<string>();
    const refunds: GatewayListedRefund[] = [];
    for (const record of this.opsByRef.values()) {
      if (
        record.operation !== 'refund' ||
        record.providerPaymentRef !== input.providerPaymentRef ||
        !record.providerRefundRef ||
        seen.has(record.providerRefundRef)
      ) {
        continue;
      }
      seen.add(record.providerRefundRef);
      let status: GatewayListedRefund['status'] = 'unknown';
      if (record.outcomeClass === 'SUCCESS') {
        status = 'succeeded';
      } else if (record.outcomeClass === 'CONFIRMED_FAILURE') {
        status = 'failed';
      } else if (record.outcomeClass === 'ACTION_REQUIRED') {
        status = 'requires_action';
      } else {
        status = 'pending';
      }
      refunds.push({
        providerRefundRef: record.providerRefundRef,
        amountCents: record.amountCents ?? 0,
        status,
        paymentIntentRef: record.providerPaymentRef,
      });
    }
    return Promise.resolve({ outcomeClass: 'SUCCESS', refunds });
  }

  private lookup(
    input: GatewayRetrieveInput,
    operation: SimOpRecord['operation'],
  ): GatewayRetrieveResult {
    let record: SimOpRecord | undefined;
    if (input.idempotencyKey) {
      record = this.opsByKey.get(input.idempotencyKey);
    }
    const refs = [
      input.providerPaymentRef,
      input.providerAuthorizationRef,
      input.providerCaptureRef,
      input.providerRefundRef,
    ].filter(Boolean) as string[];
    for (const ref of refs) {
      const byRef = this.opsByRef.get(ref);
      if (byRef && (!record || byRef.operation === operation)) {
        record = byRef;
        break;
      }
    }
    if (!record) {
      return {
        outcomeClass: 'NETWORK_UNKNOWN',
        lifecycleHint: 'PENDING',
        errorMessage: 'Simulated: operation not found',
      };
    }
    return {
      outcomeClass: record.outcomeClass,
      lifecycleHint: record.lifecycleHint,
      providerPaymentRef: record.providerPaymentRef,
      providerAuthorizationRef: record.providerAuthorizationRef,
      providerCaptureRef: record.providerCaptureRef,
      providerRefundRef: record.providerRefundRef,
      authorizationExpiresAt: record.authorizationExpiresAt,
      providerStatusRaw: record.outcomeClass,
    };
  }
}
