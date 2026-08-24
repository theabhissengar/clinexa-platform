import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type Product,
  type ProductVariant,
  type User,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import type { PlanProductBinding } from './subscription.types';

export type CatalogLineSnapshot = {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  productType: string;
  isRxEligible: boolean;
  catalogMetadata: Record<string, unknown>;
  quantity: number;
  unitPriceCents: number;
  salePriceCents: number;
  currency: string;
};

export type CustomerSnapshot = {
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
};

/**
 * Immutable snapshot builders (docs/36 §8/§15). Period math lives in
 * SubscriptionsScheduleService.
 */
@Injectable()
export class SubscriptionsSnapshotService {
  snapshotCatalogLine(
    product: Pick<
      Product,
      | 'id'
      | 'name'
      | 'productType'
      | 'isRxEligible'
      | 'brandName'
      | 'deletedAt'
      | 'limitSubscription'
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
    quantity: number,
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
        limitSubscription: product.limitSubscription,
      },
      quantity,
      unitPriceCents: variant.priceCents,
      salePriceCents,
      currency: variant.currency,
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

  parsePlanBindings(raw: unknown): PlanProductBinding[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_PLAN_NOT_BINDABLE,
        message: 'Subscription plan has no product/variant bindings',
      });
    }
    return raw.map((row, index) => {
      const item = row as Partial<PlanProductBinding>;
      if (
        typeof item.productId !== 'string' ||
        typeof item.variantId !== 'string' ||
        !Number.isInteger(item.quantity) ||
        (item.quantity ?? 0) < 1
      ) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_PLAN_NOT_BINDABLE,
          message: `Invalid plan product binding at index ${index}`,
        });
      }
      return {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity as number,
      };
    });
  }

  maxConcurrentForLimit(limitSubscription: string | null): number | null {
    if (limitSubscription == null || limitSubscription.trim() === '') {
      return null;
    }
    const parsed = Number.parseInt(limitSubscription, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    const lowered = limitSubscription.trim().toLowerCase();
    if (lowered === 'false' || lowered === 'no' || lowered === '0') {
      return null;
    }
    return 1;
  }
}
