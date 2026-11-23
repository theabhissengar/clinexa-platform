import {
  checkoutOrderIdempotencyKey,
  computeCheckoutRequestHash,
} from './checkout-fingerprint';

describe('checkout fingerprint', () => {
  const base = {
    userId: 'user-1',
    lines: [
      { variantId: 'b-var', quantity: 1 },
      { variantId: 'a-var', quantity: 2 },
    ],
    shippingAddress: {
      line1: ' 1 Main ',
      city: 'Austin',
      country: 'us',
      postalCode: '78701',
    },
    billingAddress: {
      line1: '1 Main',
      city: 'Austin',
      country: 'US',
      postalCode: '78701',
    },
    paymentMethodId: 'pm-1',
  };

  it('is stable for equivalent normalized payloads', () => {
    const a = computeCheckoutRequestHash(base);
    const b = computeCheckoutRequestHash({
      ...base,
      lines: [
        { variantId: 'a-var', quantity: 2 },
        { variantId: 'b-var', quantity: 1 },
      ],
      shippingAddress: {
        line1: '1 Main',
        city: 'Austin',
        country: 'US',
        postalCode: '78701',
      },
    });
    expect(a).toBe(b);
  });

  it('changes when payment method differs', () => {
    const a = computeCheckoutRequestHash(base);
    const b = computeCheckoutRequestHash({
      ...base,
      paymentMethodId: 'pm-2',
    });
    expect(a).not.toBe(b);
  });

  it('scopes order idempotency key by user', () => {
    expect(checkoutOrderIdempotencyKey('u1', 'k1')).toBe('checkout:user:u1:k1');
  });
});
