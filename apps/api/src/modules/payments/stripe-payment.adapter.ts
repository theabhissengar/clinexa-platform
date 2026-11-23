import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

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
import { STRIPE_API_VERSION } from './stripe-api-version';
import { mapStripeError } from './stripe-error.map';

function asCharge(
  latest: string | Stripe.Charge | null | undefined,
): Stripe.Charge | null {
  if (!latest || typeof latest === 'string') {
    return null;
  }
  return latest;
}

function captureBeforeFromPi(pi: Stripe.PaymentIntent): Date | undefined {
  const charge = asCharge(pi.latest_charge);
  const before = charge?.payment_method_details?.card?.capture_before;
  if (typeof before === 'number' && before > 0) {
    return new Date(before * 1000);
  }
  return undefined;
}

function latestChargeId(pi: Stripe.PaymentIntent): string | undefined {
  const latest = pi.latest_charge;
  if (!latest) {
    return undefined;
  }
  return typeof latest === 'string' ? latest : latest.id;
}

@Injectable()
export class StripePaymentAdapter implements PaymentGateway {
  private readonly logger = new Logger(StripePaymentAdapter.name);
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string | null>('payments.stripeSecretKey');
    if (!key?.startsWith('sk_test_')) {
      throw new Error(
        'StripePaymentAdapter requires payments.stripeSecretKey (sk_test_…)',
      );
    }
    this.stripe = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
  }

  /** Expose client for webhook constructEvent / PM retrieve helpers. */
  getClient(): Stripe {
    return this.stripe;
  }

  async authorize(
    input: GatewayAuthorizeInput,
  ): Promise<GatewayAuthorizeResult> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          capture_method: 'manual',
          confirm: true,
          payment_method: input.providerMethodRef,
          ...(input.providerCustomerRef
            ? { customer: input.providerCustomerRef }
            : {}),
          off_session: true,
          metadata: input.metadata ?? {},
          expand: ['latest_charge'],
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return this.mapAuthorizePi(pi);
    } catch (error) {
      const mapped = mapStripeError(error);
      return {
        success: false,
        outcomeClass: mapped.outcomeClass,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
        providerPaymentRef: mapped.providerPaymentRef,
        providerAuthorizationRef: mapped.providerPaymentRef,
      };
    }
  }

  private mapAuthorizePi(pi: Stripe.PaymentIntent): GatewayAuthorizeResult {
    const refs = {
      providerPaymentRef: pi.id,
      providerAuthorizationRef: pi.id,
      providerStatusRaw: pi.status,
      authorizationExpiresAt: captureBeforeFromPi(pi),
    };
    if (pi.status === 'requires_capture') {
      return {
        success: true,
        outcomeClass: 'SUCCESS',
        ...refs,
      };
    }
    if (pi.status === 'requires_action') {
      return {
        success: false,
        outcomeClass: 'ACTION_REQUIRED',
        ...refs,
        ...(pi.client_secret ? { clientSecret: pi.client_secret } : {}),
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: 'Payment requires customer authentication (SCA)',
      };
    }
    if (
      pi.status === 'processing' ||
      pi.status === 'requires_confirmation' ||
      pi.status === 'requires_payment_method'
    ) {
      // requires_payment_method after confirm often means decline — check last_payment_error
      if (pi.status === 'requires_payment_method' && pi.last_payment_error) {
        return {
          success: false,
          outcomeClass: 'CONFIRMED_FAILURE',
          ...refs,
          errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
          errorMessage: pi.last_payment_error.message ?? 'Authorization failed',
        };
      }
      return {
        success: false,
        outcomeClass: 'NETWORK_UNKNOWN',
        ...refs,
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: `PaymentIntent status ${pi.status}`,
      };
    }
    if (pi.status === 'canceled') {
      return {
        success: false,
        outcomeClass: 'CONFIRMED_FAILURE',
        ...refs,
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        errorMessage: 'PaymentIntent canceled',
      };
    }
    if (pi.status === 'succeeded') {
      // Unexpected for manual-capture authorize — still treat as authorized success.
      return {
        success: true,
        outcomeClass: 'SUCCESS',
        ...refs,
      };
    }
    return {
      success: false,
      outcomeClass: 'NETWORK_UNKNOWN',
      ...refs,
      errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      errorMessage: `Unhandled PaymentIntent status ${pi.status}`,
    };
  }

  async capture(input: GatewayCaptureInput): Promise<GatewayCaptureResult> {
    try {
      const pi = await this.stripe.paymentIntents.capture(
        input.providerPaymentRef,
        {
          ...(input.amountCents > 0
            ? { amount_to_capture: input.amountCents }
            : {}),
          expand: ['latest_charge'],
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (pi.status === 'succeeded') {
        return {
          success: true,
          outcomeClass: 'SUCCESS',
          providerCaptureRef: latestChargeId(pi) ?? pi.id,
          providerStatusRaw: pi.status,
        };
      }
      return {
        success: false,
        outcomeClass: 'NETWORK_UNKNOWN',
        providerStatusRaw: pi.status,
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: `Capture left status ${pi.status}`,
      };
    } catch (error) {
      const mapped = mapStripeError(error);
      return {
        success: false,
        outcomeClass: mapped.outcomeClass,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }
  }

  async void(input: GatewayVoidInput): Promise<GatewayVoidResult> {
    try {
      const pi = await this.stripe.paymentIntents.cancel(
        input.providerPaymentRef,
        {},
        { idempotencyKey: input.idempotencyKey },
      );
      if (pi.status === 'canceled') {
        return { success: true, outcomeClass: 'SUCCESS' };
      }
      return {
        success: false,
        outcomeClass: 'NETWORK_UNKNOWN',
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage: `Cancel left status ${pi.status}`,
      };
    } catch (error) {
      // Already canceled is success for void semantics
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        /already.*?cancel/i.test(error.message)
      ) {
        return { success: true, outcomeClass: 'SUCCESS' };
      }
      const mapped = mapStripeError(error);
      return {
        success: false,
        outcomeClass: mapped.outcomeClass,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefundResult> {
    try {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: input.providerPaymentRef,
          amount: input.amountCents,
          ...(input.reason ? { reason: 'requested_by_customer' as const } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (refund.status === 'succeeded') {
        return {
          success: true,
          outcomeClass: 'SUCCESS',
          providerRefundRef: refund.id,
        };
      }
      if (refund.status === 'pending' || refund.status === 'requires_action') {
        return {
          success: false,
          outcomeClass: 'NETWORK_UNKNOWN',
          providerRefundRef: refund.id,
          errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          errorMessage: `Refund status ${refund.status}`,
        };
      }
      return {
        success: false,
        outcomeClass: 'CONFIRMED_FAILURE',
        providerRefundRef: refund.id,
        errorCode: ErrorCodes.PAY_REFUND_INELIGIBLE,
        errorMessage: `Refund status ${refund.status}`,
      };
    } catch (error) {
      const mapped = mapStripeError(error);
      return {
        success: false,
        outcomeClass: mapped.outcomeClass,
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }
  }

  cancelRecurring(
    input: GatewayCancelRecurringInput,
  ): Promise<GatewayCancelRecurringResult> {
    void input;
    return Promise.resolve({
      ok: false,
      unsupported: true,
      errorCode: ErrorCodes.PAY_UNSUPPORTED_OPERATION,
      errorMessage:
        'Stripe Billing recurring cancel is out of scope (Phase 6C)',
    });
  }

  verifyWebhook(input: GatewayWebhookVerifyInput): boolean {
    const secret =
      this.config.get<string | null>('payments.stripeWebhookSecret') ?? '';
    if (!input.rawBody || !input.signatureHeader || !secret) {
      return false;
    }
    try {
      this.stripe.webhooks.constructEvent(
        input.rawBody,
        input.signatureHeader,
        secret,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Stripe webhook verify failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    const secret = this.config.getOrThrow<string>(
      'payments.stripeWebhookSecret',
    );
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  async retrieveAuthorization(
    input: GatewayRetrieveInput,
  ): Promise<GatewayRetrieveResult> {
    return this.retrievePi(input.providerPaymentRef, 'authorization');
  }

  async retrieveCapture(
    input: GatewayRetrieveInput,
  ): Promise<GatewayRetrieveResult> {
    return this.retrievePi(input.providerPaymentRef, 'capture');
  }

  async retrieveRefund(
    input: GatewayRetrieveInput,
  ): Promise<GatewayRetrieveResult> {
    if (!input.providerRefundRef) {
      return {
        outcomeClass: 'NETWORK_UNKNOWN',
        lifecycleHint: 'PENDING',
        errorMessage: 'providerRefundRef required for Stripe retrieve',
      };
    }
    try {
      const refund = await this.stripe.refunds.retrieve(
        input.providerRefundRef,
      );
      if (refund.status === 'succeeded') {
        return {
          outcomeClass: 'SUCCESS',
          lifecycleHint: 'REFUNDED',
          providerRefundRef: refund.id,
          providerStatusRaw: refund.status,
        };
      }
      if (refund.status === 'failed' || refund.status === 'canceled') {
        return {
          outcomeClass: 'CONFIRMED_FAILURE',
          lifecycleHint: 'REFUND_FAILED',
          providerRefundRef: refund.id,
          providerStatusRaw: refund.status,
        };
      }
      // pending / requires_action — non-terminal; keep ref for reconcile.
      return {
        outcomeClass:
          refund.status === 'requires_action'
            ? 'ACTION_REQUIRED'
            : 'NETWORK_UNKNOWN',
        lifecycleHint: 'PENDING',
        providerRefundRef: refund.id,
        providerStatusRaw: refund.status ?? undefined,
      };
    } catch (error) {
      const mapped = mapStripeError(error);
      return {
        outcomeClass: mapped.outcomeClass,
        lifecycleHint: 'PENDING',
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }
  }

  async listRefundsByPaymentRef(input: {
    providerPaymentRef: string;
  }): Promise<GatewayListRefundsResult> {
    try {
      const page = await this.stripe.refunds.list({
        payment_intent: input.providerPaymentRef,
        limit: 100,
      });
      const refunds: GatewayListedRefund[] = page.data.map((refund) => {
        let status: GatewayListedRefund['status'] = 'unknown';
        if (refund.status === 'succeeded') {
          status = 'succeeded';
        } else if (refund.status === 'pending') {
          status = 'pending';
        } else if (refund.status === 'failed') {
          status = 'failed';
        } else if (refund.status === 'canceled') {
          status = 'canceled';
        } else if (refund.status === 'requires_action') {
          status = 'requires_action';
        }
        const pi =
          typeof refund.payment_intent === 'string'
            ? refund.payment_intent
            : refund.payment_intent?.id;
        return {
          providerRefundRef: refund.id,
          amountCents: refund.amount,
          currency: refund.currency?.toUpperCase(),
          status,
          paymentIntentRef: pi ?? input.providerPaymentRef,
        };
      });
      return { outcomeClass: 'SUCCESS', refunds };
    } catch (error) {
      const mapped = mapStripeError(error);
      return {
        outcomeClass: mapped.outcomeClass,
        refunds: [],
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }
  }

  private async retrievePi(
    providerPaymentRef: string | null | undefined,
    operation: 'authorization' | 'capture',
  ): Promise<GatewayRetrieveResult> {
    if (!providerPaymentRef) {
      return {
        outcomeClass: 'NETWORK_UNKNOWN',
        lifecycleHint: 'PENDING',
        errorMessage: 'providerPaymentRef required for Stripe retrieve',
      };
    }
    try {
      const pi = await this.stripe.paymentIntents.retrieve(providerPaymentRef, {
        expand: ['latest_charge'],
      });
      if (operation === 'authorization') {
        if (pi.status === 'requires_capture') {
          return {
            outcomeClass: 'SUCCESS',
            lifecycleHint: 'AUTHORIZED',
            providerPaymentRef: pi.id,
            providerAuthorizationRef: pi.id,
            authorizationExpiresAt: captureBeforeFromPi(pi),
            providerStatusRaw: pi.status,
          };
        }
        if (pi.status === 'requires_action') {
          return {
            outcomeClass: 'ACTION_REQUIRED',
            lifecycleHint: 'PENDING',
            providerPaymentRef: pi.id,
            providerAuthorizationRef: pi.id,
            providerStatusRaw: pi.status,
            ...(pi.client_secret ? { clientSecret: pi.client_secret } : {}),
          };
        }
        if (pi.status === 'canceled') {
          return {
            outcomeClass: 'CONFIRMED_FAILURE',
            lifecycleHint: 'AUTHORIZATION_FAILED',
            providerPaymentRef: pi.id,
            providerStatusRaw: pi.status,
          };
        }
        if (pi.status === 'requires_payment_method' && pi.last_payment_error) {
          return {
            outcomeClass: 'CONFIRMED_FAILURE',
            lifecycleHint: 'AUTHORIZATION_FAILED',
            providerPaymentRef: pi.id,
            providerStatusRaw: pi.status,
          };
        }
        if (pi.status === 'succeeded') {
          return {
            outcomeClass: 'SUCCESS',
            lifecycleHint: 'CAPTURED',
            providerPaymentRef: pi.id,
            providerCaptureRef: latestChargeId(pi),
            providerStatusRaw: pi.status,
          };
        }
        return {
          outcomeClass: 'NETWORK_UNKNOWN',
          lifecycleHint: 'PENDING',
          providerPaymentRef: pi.id,
          providerStatusRaw: pi.status,
        };
      }
      // capture
      if (pi.status === 'succeeded') {
        return {
          outcomeClass: 'SUCCESS',
          lifecycleHint: 'CAPTURED',
          providerPaymentRef: pi.id,
          providerCaptureRef: latestChargeId(pi),
          providerStatusRaw: pi.status,
        };
      }
      if (pi.status === 'canceled') {
        return {
          outcomeClass: 'CONFIRMED_FAILURE',
          lifecycleHint: 'CAPTURE_FAILED',
          providerPaymentRef: pi.id,
          providerStatusRaw: pi.status,
        };
      }
      return {
        outcomeClass: 'NETWORK_UNKNOWN',
        lifecycleHint: 'PENDING',
        providerPaymentRef: pi.id,
        providerStatusRaw: pi.status,
      };
    } catch (error) {
      const mapped = mapStripeError(error);
      return {
        outcomeClass: mapped.outcomeClass,
        lifecycleHint: 'PENDING',
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      };
    }
  }

  /** Best-effort Search — zero hits are not proof of absence. */
  async searchPaymentIntentsByPaymentId(
    clinexaPaymentId: string,
  ): Promise<Stripe.PaymentIntent[]> {
    try {
      const result = await this.stripe.paymentIntents.search({
        query: `metadata["clinexa_payment_id"]:"${clinexaPaymentId}"`,
        limit: 10,
      });
      return result.data;
    } catch (error) {
      this.logger.warn(
        `PaymentIntent search failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  async searchCustomersByUserId(
    clinexaUserId: string,
  ): Promise<Stripe.Customer[]> {
    try {
      const result = await this.stripe.customers.search({
        query: `metadata["clinexa_user_id"]:"${clinexaUserId}"`,
        limit: 10,
      });
      return result.data;
    } catch (error) {
      this.logger.warn(
        `Customer search failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  async retrievePaymentMethod(
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.retrieve(paymentMethodId);
  }

  async createTestCustomer(input: {
    userId: string;
    idempotencyKey: string;
  }): Promise<Stripe.Customer> {
    return this.stripe.customers.create(
      {
        metadata: { clinexa_user_id: input.userId },
      },
      { idempotencyKey: input.idempotencyKey },
    );
  }
}
