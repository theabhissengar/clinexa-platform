import type Stripe from 'stripe';

import type { WebhookEnvelope } from './payment.types';

export type MappedStripeWebhook = {
  envelope: WebhookEnvelope | null;
  /** True when event is recognized but must not mutate money (ignore / no-op). */
  noOp: boolean;
  reason?: string;
};

function piIdFromObject(obj: Stripe.Event.Data.Object): string | undefined {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }
  const record = obj as {
    object?: string;
    id?: string;
    payment_intent?: string | { id?: string } | null;
  };
  if (record.object === 'payment_intent' && typeof record.id === 'string') {
    return record.id;
  }
  if (typeof record.payment_intent === 'string') {
    return record.payment_intent;
  }
  if (
    record.payment_intent &&
    typeof record.payment_intent === 'object' &&
    typeof record.payment_intent.id === 'string'
  ) {
    return record.payment_intent.id;
  }
  if (record.object === 'charge') {
    const charge = obj as Stripe.Charge;
    const pi = charge.payment_intent;
    if (typeof pi === 'string') {
      return pi;
    }
    if (pi && typeof pi === 'object' && 'id' in pi) {
      return pi.id;
    }
  }
  if (record.object === 'refund') {
    const refund = obj as Stripe.Refund;
    const pi = refund.payment_intent;
    if (typeof pi === 'string') {
      return pi;
    }
    if (pi && typeof pi === 'object' && 'id' in pi) {
      return pi.id;
    }
  }
  return undefined;
}

/**
 * Map Stripe Event → internal WebhookEnvelope used by PaymentsService.applyWebhookBusiness.
 * Refund accounting uses refund.* with Refund payloads — never charge.refunded → full REFUNDED.
 */
export function mapStripeEventToEnvelope(
  event: Stripe.Event,
): MappedStripeWebhook {
  const paymentRef = piIdFromObject(event.data.object);
  const base = {
    provider: 'stripe',
    providerEventId: event.id,
    paymentRef,
    data: {
      stripeType: event.type,
      object: event.data.object as unknown as Record<string, unknown>,
    },
  };

  switch (event.type) {
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed':
    case 'charge.refund.updated':
      return {
        envelope: { ...base, type: 'refund.provider_update' },
        noOp: false,
      };
    case 'charge.refunded':
      // Charge object — never treat as full payment refunded.
      return {
        envelope: { ...base, type: 'refund.charge_refunded_notice' },
        noOp: false,
      };
    case 'payment_intent.payment_failed':
      return {
        envelope: { ...base, type: 'payment.authorization_failed' },
        noOp: false,
      };
    case 'payment_intent.canceled':
      return {
        envelope: { ...base, type: 'payment.voided' },
        noOp: false,
      };
    case 'payment_intent.succeeded':
      return {
        envelope: { ...base, type: 'payment.captured' },
        noOp: false,
      };
    case 'payment_intent.requires_action':
      return {
        envelope: { ...base, type: 'payment.requires_action' },
        noOp: false,
      };
    case 'payment_intent.amount_capturable_updated':
      return {
        envelope: { ...base, type: 'payment.authorized' },
        noOp: false,
      };
    default:
      return {
        envelope: {
          ...base,
          type: `stripe.unmapped:${event.type}`,
        },
        noOp: true,
        reason: `Unmapped Stripe event ${event.type}`,
      };
  }
}
