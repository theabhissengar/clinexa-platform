import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Admin UI payment/promotion boundaries', () => {
  const adminRoot = join(__dirname, '../../../../admin/src');

  function collect(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collect(full));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
    return files;
  }

  it('does not import Prisma, PSP SDKs, or payment-state logic in admin', () => {
    const files = collect(adminRoot);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('@prisma/client')).toBe(false);
      expect(text.includes('generated/prisma')).toBe(false);
      expect(text.toLowerCase().includes('from "stripe"')).toBe(false);
      expect(text.includes('PaymentGateway')).toBe(false);
    }
  });

  it('uses API clients only for payments and coupons', () => {
    const features = [
      join(adminRoot, 'features/payments'),
      join(adminRoot, 'features/coupons'),
    ];
    for (const dir of features) {
      for (const file of collect(dir)) {
        const text = readFileSync(file, 'utf8');
        expect(text.includes('prisma.')).toBe(false);
        expect(text.includes('evaluatePricing')).toBe(false);
        expect(text.includes('initiateRefund(')).toBe(false);
        expect(text.includes('recordRedemption')).toBe(false);
      }
    }
  });

  it('Guardian coupon form submits selected PRODUCT/CATEGORY scope IDs', () => {
    const helper = readFileSync(
      join(adminRoot, 'features/coupons/lib/coupon-form-payload.ts'),
      'utf8',
    );
    expect(helper).toContain('values.scopeType === "PRODUCT"');
    expect(helper).toContain('payload.scopeProductIds');
    expect(helper).toContain('values.scopeType === "CATEGORY"');
    expect(helper).toContain('payload.scopeCategoryIds');
    const form = readFileSync(
      join(
        adminRoot,
        'features/coupons/components/guardian-coupon-form-page.tsx',
      ),
      'utf8',
    );
    expect(form).toContain('buildCouponFormPayload');
    expect(form).toContain('listAdminProducts');
    expect(form).toContain('listAdminCategories');
    expect(form).toContain('scopeProductIds');
    expect(form).toContain('scopeCategoryIds');
  });

  it('CRM order detail links latest payment to Guardian payment detail', () => {
    const crm = readFileSync(
      join(adminRoot, 'features/orders/components/crm-order-detail-page.tsx'),
      'utf8',
    );
    expect(crm).toContain('/guardian/payments/${order.latestPaymentId}');
    expect(crm).toContain('initiateCrmRefund');
  });
});
