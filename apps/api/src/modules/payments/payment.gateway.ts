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
 * Provider-agnostic payment gateway (PAY-007 / ARCH-070).
 * Domain rules must not depend on a named PSP. Stripe adapters implement this later.
 */
export interface PaymentGateway {
  authorize(input: GatewayAuthorizeInput): Promise<GatewayAuthorizeResult>;
  capture(input: GatewayCaptureInput): Promise<GatewayCaptureResult>;
  void(input: GatewayVoidInput): Promise<GatewayVoidResult>;
  refund(input: GatewayRefundInput): Promise<GatewayRefundResult>;
  cancelRecurring(input: GatewayCancelRecurringInput): Promise<void>;
  verifyWebhook(input: GatewayWebhookVerifyInput): boolean;
}
