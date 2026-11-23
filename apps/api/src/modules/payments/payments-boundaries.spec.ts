import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Payments domain boundaries', () => {
  const sources = readdirSync(__dirname)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => ({
      name,
      text: readFileSync(join(__dirname, name), 'utf8'),
    }));

  it('does not import Promotions or calculate coupon discounts', () => {
    for (const file of sources) {
      expect(file.text.includes('../promotions')).toBe(false);
      expect(file.text.includes('PricingEngine')).toBe(false);
      expect(file.text.includes('couponCode')).toBe(false);
    }
  });

  it('confines Stripe SDK imports to stripe-* files (Phase 6C)', () => {
    const stripeImporters = sources.filter(
      (file) =>
        file.text.includes("from 'stripe'") ||
        file.text.includes('from "stripe"'),
    );
    for (const file of stripeImporters) {
      expect(file.name.startsWith('stripe-')).toBe(true);
    }
    expect(stripeImporters.length).toBeGreaterThan(0);
  });

  it('does not import Orders or Subscriptions domain modules', () => {
    for (const file of sources) {
      expect(file.text.includes('../orders/')).toBe(false);
      expect(file.text.includes('../subscriptions/')).toBe(false);
    }
  });
});
