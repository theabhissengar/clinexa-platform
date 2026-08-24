import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

import { ErrorCodes } from '../../common/constants/error-codes';
import type { PaymentGateway } from './payment.gateway';
import type {
  GatewayAuthorizeInput,
  GatewayAuthorizeResult,
  GatewayCancelRecurringInput,
  GatewayCaptureInput,
  GatewayCaptureResult,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayVoidInput,
  GatewayVoidResult,
  GatewayWebhookVerifyInput,
} from './payment.types';

/**
 * Deterministic sandbox adapter for P14e (PAY-029). No Stripe SDK.
 * Idempotent keys map to stable provider refs within-process via hashing.
 */
@Injectable()
export class SimulatedPaymentAdapter implements PaymentGateway {
  constructor(private readonly config: ConfigService) {}

  private force(
    inputForce?: 'decline' | 'timeout' | null,
  ): 'decline' | 'timeout' | null {
    if (inputForce) {
      return inputForce;
    }
    const fromEnv = this.config.get<string | null>('payments.simulatedForce');
    if (fromEnv === 'decline' || fromEnv === 'timeout') {
      return fromEnv;
    }
    return null;
  }

  private stableRef(prefix: string, idempotencyKey: string): string {
    const hash = createHash('sha256')
      .update(idempotencyKey)
      .digest('hex')
      .slice(0, 24);
    return `sim_${prefix}_${hash}`;
  }

  authorize(input: GatewayAuthorizeInput): Promise<GatewayAuthorizeResult> {
    const force = this.force(input.forceOutcome);
    if (force === 'timeout') {
      return Promise.resolve({
        success: false,
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated provider timeout',
      });
    }
    if (force === 'decline') {
      return Promise.resolve({
        success: false,
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        errorMessage: 'Simulated authorization declined',
      });
    }
    const providerPaymentRef = this.stableRef('pay', input.idempotencyKey);
    return Promise.resolve({
      success: true,
      providerPaymentRef,
      providerAuthorizationRef: this.stableRef('auth', input.idempotencyKey),
    });
  }

  capture(input: GatewayCaptureInput): Promise<GatewayCaptureResult> {
    const force = this.force(input.forceOutcome);
    if (force === 'timeout') {
      return Promise.resolve({
        success: false,
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated capture timeout',
      });
    }
    if (force === 'decline') {
      return Promise.resolve({
        success: false,
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        errorMessage: 'Simulated capture declined',
      });
    }
    return Promise.resolve({
      success: true,
      providerCaptureRef: this.stableRef('cap', input.idempotencyKey),
    });
  }

  void(input: GatewayVoidInput): Promise<GatewayVoidResult> {
    void input;
    return Promise.resolve({ success: true });
  }

  refund(input: GatewayRefundInput): Promise<GatewayRefundResult> {
    return Promise.resolve({
      success: true,
      providerRefundRef: this.stableRef(
        'ref',
        input.idempotencyKey || randomUUID(),
      ),
    });
  }

  cancelRecurring(input: GatewayCancelRecurringInput): Promise<void> {
    void input;
    return Promise.resolve();
  }

  verifyWebhook(input: GatewayWebhookVerifyInput): boolean {
    if (!input.secretHeader || !input.expectedSecret) {
      return false;
    }
    return input.secretHeader === input.expectedSecret;
  }
}
