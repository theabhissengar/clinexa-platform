import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * P13e boundary guard: Orders must orchestrate Inventory via Nest services only —
 * never write inventory tables through Prisma.
 */
describe('Orders domain boundaries', () => {
  const sources = readdirSync(__dirname)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => ({
      name,
      text: readFileSync(join(__dirname, name), 'utf8'),
    }));

  it('does not write Inventory aggregates via Prisma', () => {
    const forbidden = [
      'tx.stockMovement',
      'prisma.stockMovement',
      'tx.inventoryBalance',
      'prisma.inventoryBalance',
      'tx.stockReservation',
      'prisma.stockReservation',
      'tx.stockReservationLine',
      'prisma.stockReservationLine',
    ];
    for (const file of sources) {
      for (const token of forbidden) {
        expect(file.text.includes(token)).toBe(false);
      }
    }
  });

  it('wires OrderInventoryOrchestrator for P13e', () => {
    const moduleFile = sources.find((f) => f.name === 'orders.module.ts');
    expect(moduleFile?.text).toContain('OrderInventoryOrchestrator');
    expect(moduleFile?.text).toContain('InventoryModule');
    expect(
      sources.some((f) => f.name === 'order-inventory.orchestrator.ts'),
    ).toBe(true);
  });

  it('does not import PSP adapters or provider-specific types', () => {
    for (const file of sources) {
      expect(file.text.includes('PaymentGateway')).toBe(false);
      expect(file.text.includes('SimulatedPaymentAdapter')).toBe(false);
      expect(file.text.toLowerCase().includes("from 'stripe'")).toBe(false);
    }
  });

  it('does not inspect Coupon entities or calculate discounts itself', () => {
    for (const file of sources) {
      expect(file.text.includes('prisma.coupon')).toBe(false);
      expect(file.text.includes('tx.coupon')).toBe(false);
      expect(file.text.includes('CouponDiscountType')).toBe(false);
      expect(file.text.includes('CouponValidationService')).toBe(false);
    }
  });
});
