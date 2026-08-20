import { Injectable } from '@nestjs/common';
import {
  OrderAddressKind,
  type Product,
  type ProductVariant,
  type User,
} from '../../../generated/prisma';

import type { OrderAddressInput } from './order.types';

export type CatalogLineSnapshot = {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  productType: string;
  isRxEligible: boolean;
  catalogMetadata: Record<string, unknown>;
  unitPriceCents: number;
  salePriceCents: number;
};

export type CustomerSnapshot = {
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
};

export type AddressSnapshotRow = {
  kind: OrderAddressKind;
  fullName: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
};

/**
 * Immutable snapshot builders (docs/35 §8). Historical rendering must not
 * depend on live Product/User rows.
 */
@Injectable()
export class OrderSnapshotService {
  snapshotCatalogLine(
    product: Pick<
      Product,
      'id' | 'name' | 'productType' | 'isRxEligible' | 'brandName' | 'deletedAt'
    >,
    variant: Pick<
      ProductVariant,
      | 'id'
      | 'productId'
      | 'sku'
      | 'label'
      | 'priceCents'
      | 'salePriceCents'
      | 'currency'
      | 'isFulfillable'
      | 'optionValues'
      | 'deletedAt'
    >,
  ): CatalogLineSnapshot {
    const salePriceCents =
      variant.salePriceCents != null
        ? variant.salePriceCents
        : variant.priceCents;

    return {
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      sku: variant.sku,
      productType: String(product.productType),
      isRxEligible: product.isRxEligible,
      catalogMetadata: {
        brandName: product.brandName,
        variantLabel: variant.label,
        optionValues: variant.optionValues,
        currency: variant.currency,
        isFulfillable: variant.isFulfillable,
      },
      unitPriceCents: variant.priceCents,
      salePriceCents,
    };
  }

  snapshotCustomer(
    user: Pick<User, 'firstName' | 'lastName' | 'email' | 'phone'>,
    override?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
    },
  ): CustomerSnapshot {
    return {
      customerFirstName: override?.firstName ?? user.firstName ?? null,
      customerLastName: override?.lastName ?? user.lastName ?? null,
      customerEmail: override?.email ?? user.email ?? null,
      customerPhone: override?.phone ?? user.phone ?? null,
    };
  }

  snapshotAddress(
    kind: OrderAddressKind,
    input: OrderAddressInput,
  ): AddressSnapshotRow {
    return {
      kind,
      fullName: input.fullName ?? null,
      line1: input.line1.trim(),
      line2: input.line2 ?? null,
      city: input.city.trim(),
      region: input.region ?? null,
      postalCode: input.postalCode ?? null,
      country: (input.country ?? 'US').trim() || 'US',
      phone: input.phone ?? null,
    };
  }
}
