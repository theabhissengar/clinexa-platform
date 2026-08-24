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

  async authorize(
    input: GatewayAuthorizeInput,
  ): Promise<GatewayAuthorizeResult> {
    const force = this.force(input.forceOutcome);
    if (force === 'timeout') {
      return {
        success: false,
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated provider timeout',
      };
    }
    if (force === 'decline') {
      return {
        success: false,
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        errorMessage: 'Simulated authorization declined',
      };
    }
    const providerPaymentRef = this.stableRef('pay', input.idempotencyKey);
    return {
      success: true,
      providerPaymentRef,
      providerAuthorizationRef: this.stableRef('auth', input.idempotencyKey),
    };
  }

  async capture(input: GatewayCaptureInput): Promise<GatewayCaptureResult> {
    const force = this.force(input.forceOutcome);
    if (force === 'timeout') {
      return {
        success: false,
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Simulated capture timeout',
      };
    }
    if (force === 'decline') {
      return {
        success: false,
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        errorMessage: 'Simulated capture declined',
      };
    }
    return {
      success: true,
      providerCaptureRef: this.stableRef('cap', input.idempotencyKey),
    };
  }

  async void(_input: GatewayVoidInput): Promise<GatewayVoidResult> {
    return { success: true };
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefundResult> {
    return {
      success: true,
      providerRefundRef: this.stableRef(
        'ref',
        input.idempotencyKey || randomUUID(),
      ),
    };
  }

  async cancelRecurring(_input: GatewayCancelRecurringInput): Promise<void> {
    // Simulated no-op success — provider recurring object cancelled.
  }

  verifyWebhook(input: GatewayWebhookVerifyInput): boolean {
    if (!input.secretHeader || !input.expectedSecret) {
      return false;
    }
    return input.secretHeader === input.expectedSecret;
  }
}
