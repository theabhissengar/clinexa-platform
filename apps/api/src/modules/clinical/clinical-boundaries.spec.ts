import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * P14g boundary: Clinical module is an integration adapter / event sink —
 * not clinical record SoT and not Inventory/Payments mutation owner.
 */
describe('Clinical domain boundaries (P14g)', () => {
  const sources = readdirSync(__dirname)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .flatMap((name) => {
      const path = join(__dirname, name);
      // dto/ is a directory — skip; only top-level + dto files via recursive-ish read
      try {
        const stat = readFileSync(path, 'utf8');
        return [{ name, text: stat }];
      } catch {
        return [];
      }
    });

  const dtoDir = join(__dirname, 'dto');
  try {
    for (const name of readdirSync(dtoDir)) {
      if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
        sources.push({
          name: `dto/${name}`,
          text: readFileSync(join(dtoDir, name), 'utf8'),
        });
      }
    }
  } catch {
    // no dto dir
  }

  it('does not write Inventory or Payment aggregates via Prisma', () => {
    const forbidden = [
      'tx.stockMovement',
      'prisma.stockMovement',
      'tx.inventoryBalance',
      'prisma.inventoryBalance',
      'tx.stockReservation',
      'prisma.stockReservation',
      'tx.payment.',
      'prisma.payment.',
      'tx.refund.',
      'prisma.refund.',
    ];
    for (const file of sources) {
      for (const token of forbidden) {
        expect(file.text.includes(token)).toBe(false);
      }
    }
  });

  it('does not invent Consultation / Questionnaire / Prescription persistence', () => {
    const forbidden = [
      'tx.consultation',
      'prisma.consultation',
      'tx.questionnaire',
      'prisma.questionnaire',
      'tx.prescription',
      'prisma.prescription',
      'model Consultation',
      'InventoryReservationService',
      'InventoryModule',
      'PaymentsService',
      'stripe',
    ];
    for (const file of sources) {
      for (const token of forbidden) {
        expect(file.text.toLowerCase().includes(token.toLowerCase())).toBe(
          false,
        );
      }
    }
  });

  it('imports OrdersService for lifecycle transitions only', () => {
    const service = sources.find(
      (f) => f.name === 'clinical-outcomes.service.ts',
    );
    expect(service).toBeDefined();
    expect(service?.text).toContain("from '../orders/orders.service'");
    expect(service?.text).toContain('OrdersService');
  });
});
