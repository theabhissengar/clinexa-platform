import type {
  GatewayAuthorizeInput,
  GatewayAuthorizeResult,
  GatewayCancelRecurringInput,
  GatewayCancelRecurringResult,
  GatewayCaptureInput,
  GatewayCaptureResult,
  GatewayListRefundsResult,
  GatewayRefundInput,
  GatewayRefundResult,
  GatewayRetrieveInput,
  GatewayRetrieveResult,
  GatewayVoidInput,
  GatewayVoidResult,
  GatewayWebhookVerifyInput,
} from './payment.types';

/**
 * Provider-agnostic payment gateway (PAY-007 / ARCH-070).
 * Domain rules must not depend on a named PSP.
 */
export interface PaymentGateway {
  authorize(input: GatewayAuthorizeInput): Promise<GatewayAuthorizeResult>;
  capture(input: GatewayCaptureInput): Promise<GatewayCaptureResult>;
  void(input: GatewayVoidInput): Promise<GatewayVoidResult>;
  refund(input: GatewayRefundInput): Promise<GatewayRefundResult>;
  cancelRecurring(
    input: GatewayCancelRecurringInput,
  ): Promise<GatewayCancelRecurringResult>;
  verifyWebhook(input: GatewayWebhookVerifyInput): boolean;
  /** Optional reconcile hooks — simulated in 6B; real PSP in 6C/6F. */
  retrieveAuthorization?(
    input: GatewayRetrieveInput,
  ): Promise<GatewayRetrieveResult>;
  retrieveCapture?(input: GatewayRetrieveInput): Promise<GatewayRetrieveResult>;
  retrieveRefund?(input: GatewayRetrieveInput): Promise<GatewayRetrieveResult>;
  /** List refunds for a PaymentIntent — empty SUCCESS ≠ Search “not found”. */
  listRefundsByPaymentRef?(input: {
    providerPaymentRef: string;
  }): Promise<GatewayListRefundsResult>;
}
