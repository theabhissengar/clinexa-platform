import type Stripe from 'stripe';

import { mapStripeEventToEnvelope } from './stripe-webhook.mapper';

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: 'evt_test_1',
    object: 'event',
    type,
    data: { object: object as Stripe.Event.Data.Object },
  } as Stripe.Event;
}

describe('mapStripeEventToEnvelope', () => {
  it('maps refund.created to refund.provider_update with payment_intent ref', () => {
    const mapped = mapStripeEventToEnvelope(
      event('refund.created', {
        object: 'refund',
        id: 're_1',
        amount: 500,
        status: 'succeeded',
        payment_intent: 'pi_1',
      }),
    );
    expect(mapped.noOp).toBe(false);
    expect(mapped.envelope?.type).toBe('refund.provider_update');
    expect(mapped.envelope?.paymentRef).toBe('pi_1');
  });

  it('maps charge.refunded without treating as full payment refunded type', () => {
    const mapped = mapStripeEventToEnvelope(
      event('charge.refunded', {
        object: 'charge',
        id: 'ch_1',
        payment_intent: 'pi_1',
        amount_refunded: 100,
      }),
    );
    expect(mapped.envelope?.type).toBe('refund.charge_refunded_notice');
    expect(mapped.envelope?.type).not.toBe('payment.refunded');
  });

  it('maps requires_action to payment.requires_action', () => {
    const mapped = mapStripeEventToEnvelope(
      event('payment_intent.requires_action', {
        object: 'payment_intent',
        id: 'pi_sca',
        status: 'requires_action',
      }),
    );
    expect(mapped.envelope?.type).toBe('payment.requires_action');
    expect(mapped.envelope?.paymentRef).toBe('pi_sca');
  });

  it('marks unknown events as no-op', () => {
    const mapped = mapStripeEventToEnvelope(
      event('customer.created', { object: 'customer', id: 'cus_1' }),
    );
    expect(mapped.noOp).toBe(true);
  });
});
