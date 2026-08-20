import { OrderAddressKind, ProductType } from '../../../generated/prisma';

import { OrderSnapshotService } from './order-snapshot.service';

describe('OrderSnapshotService', () => {
  const service = new OrderSnapshotService();

  it('snapshots catalog fields independently of later product mutation', () => {
    const product = {
      id: 'p1',
      name: 'Therapy A',
      productType: ProductType.STANDARD,
      isRxEligible: true,
      brandName: 'Clinexa',
      deletedAt: null,
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

    const snap = service.snapshotCatalogLine(product, variant);
    expect(snap.productName).toBe('Therapy A');
    expect(snap.sku).toBe('SKU-1');
    expect(snap.salePriceCents).toBe(4500);
    expect(snap.isRxEligible).toBe(true);
    expect(snap.catalogMetadata).toMatchObject({ brandName: 'Clinexa' });

    // Mutating live catalog objects must not change the returned snapshot object
    product.name = 'CHANGED';
    variant.sku = 'CHANGED';
    expect(snap.productName).toBe('Therapy A');
    expect(snap.sku).toBe('SKU-1');
  });

  it('snapshots customer and addresses from user + overrides', () => {
    const customer = service.snapshotCustomer(
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '111',
      },
      { phone: '222' },
    );
    expect(customer.customerFirstName).toBe('Ada');
    expect(customer.customerPhone).toBe('222');

    const shipping = service.snapshotAddress(OrderAddressKind.SHIPPING, {
      line1: ' 1 Main ',
      city: ' Austin ',
      region: 'TX',
      postalCode: '78701',
    });
    expect(shipping.line1).toBe('1 Main');
    expect(shipping.city).toBe('Austin');
    expect(shipping.kind).toBe(OrderAddressKind.SHIPPING);
    expect(shipping.country).toBe('US');
  });
});
