import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * P14b boundary guard: Subscription domain must not execute Payments,
 * Inventory, or clinical authoring, and must not own Product/User/Order mutations.
 */
describe('Subscriptions domain boundaries', () => {
  const sources = readdirSync(__dirname)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => ({
      name,
      text: readFileSync(join(__dirname, name), 'utf8'),
    }));

  it('does not write Payments, Inventory, or clinical aggregates', () => {
    const forbidden = [
      'tx.payment.',
      'prisma.payment.',
      'tx.inventory',
      'prisma.inventory',
      'tx.inventoryBalance',
      'prisma.inventoryBalance',
      'tx.stockMovement',
      'prisma.stockMovement',
      'tx.stockReservation',
      'prisma.stockReservation',
      'tx.prescription',
      'prisma.prescription',
      'tx.questionnaire',
      'prisma.questionnaire',
      'tx.consultation',
      'prisma.consultation',
    ];
    for (const file of sources) {
      for (const token of forbidden) {
        expect(file.text.includes(token)).toBe(false);
      }
    }
  });

  it('does not import Inventory services or Inventory HTTP clients', () => {
    const forbidden = [
      'InventoryReservationService',
      'InventoryLedgerService',
      'InventoryRestockService',
      'InventoryModule',
      '../inventory/',
      "from '../inventory",
      "from '../../modules/inventory",
    ];
    for (const file of sources) {
      for (const token of forbidden) {
        expect(file.text.includes(token)).toBe(false);
      }
    }
  });

  it('does not mutate Product, User, or Order ownership rows', () => {
    for (const file of sources) {
      expect(file.text.includes('tx.product.update')).toBe(false);
      expect(file.text.includes('prisma.product.update')).toBe(false);
      expect(file.text.includes('tx.user.update')).toBe(false);
      expect(file.text.includes('prisma.user.update')).toBe(false);
      expect(file.text.includes('tx.order.update')).toBe(false);
      expect(file.text.includes('prisma.order.update')).toBe(false);
    }
  });

  it('registers CRM and Guardian HTTP controllers in this slice', () => {
    const moduleFile = sources.find(
      (file) => file.name === 'subscriptions.module.ts',
    );
    expect(moduleFile).toBeDefined();
    expect(moduleFile?.text).toContain('CrmSubscriptionsController');
    expect(moduleFile?.text).toContain('AdminSubscriptionsController');
    expect(moduleFile?.text).toContain('AdminSubscriptionPlansController');
    expect(moduleFile?.text).toContain('SubscriptionRenewalJobsController');
    expect(
      sources.some((file) => file.name === 'admin-subscriptions.controller.ts'),
    ).toBe(true);
  });

  it('does not import Stripe or call PaymentGateway from subscription sources', () => {
    for (const file of sources) {
      expect(file.text.toLowerCase().includes('stripe')).toBe(false);
      expect(file.text.includes('PaymentGateway')).toBe(false);
      expect(file.text.includes('SimulatedPaymentAdapter')).toBe(false);
    }
  });
});
