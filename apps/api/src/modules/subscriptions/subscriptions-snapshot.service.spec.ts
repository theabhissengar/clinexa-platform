import { ProductType } from '../../../generated/prisma';

import { SubscriptionsSnapshotService } from './subscriptions-snapshot.service';

describe('SubscriptionsSnapshotService', () => {
  const service = new SubscriptionsSnapshotService();

  it('snapshots catalog and customer independently of later live mutations', () => {
    const product = {
      id: 'p1',
      name: 'Therapy A',
      productType: ProductType.SIMPLE_SUBSCRIPTION,
      isRxEligible: true,
      brandName: 'Clinexa',
      deletedAt: null,
      limitSubscription: '1',
    };
    const variant = {
      id: 'v1',
      productId: 'p1',
      sku: 'SKU-1',
      label: '30ct',
      priceCents: 5000,
      salePriceCents: 4500,
      currency: 'USD',
      isFulfillable: true,
      optionValues: { size: '30' },
      deletedAt: null,
    };

    const snap = service.snapshotCatalogLine(product, variant, 2);
    const customer = service.snapshotCustomer(
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '111',
      },
      { phone: '222' },
    );

    product.name = 'CHANGED';
    variant.sku = 'CHANGED';
    expect(snap.productName).toBe('Therapy A');
    expect(snap.sku).toBe('SKU-1');
    expect(snap.salePriceCents).toBe(4500);
    expect(snap.quantity).toBe(2);
    expect(snap.isRxEligible).toBe(true);
    expect(customer.customerFirstName).toBe('Ada');
    expect(customer.customerPhone).toBe('222');
  });

  it('parses plan bindings and interprets limitSubscription', () => {
    expect(
      service.parsePlanBindings([
        { productId: 'p1', variantId: 'v1', quantity: 1 },
      ]),
    ).toEqual([{ productId: 'p1', variantId: 'v1', quantity: 1 }]);
    expect(() => service.parsePlanBindings([])).toThrow();
    expect(service.maxConcurrentForLimit(null)).toBeNull();
    expect(service.maxConcurrentForLimit('2')).toBe(2);
    expect(service.maxConcurrentForLimit('yes')).toBe(1);
  });
});
