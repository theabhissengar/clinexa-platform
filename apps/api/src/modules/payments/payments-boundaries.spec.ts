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

  it('does not add a Stripe adapter or SDK', () => {
    for (const file of sources) {
      expect(file.text.includes("from 'stripe'")).toBe(false);
      expect(file.text.includes('from "stripe"')).toBe(false);
      expect(file.text.includes('StripeAdapter')).toBe(false);
    }
  });
});
