import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { OrderAddressInput } from '../orders/order.types';
import { OrdersService } from '../orders/orders.service';

type JsonAddress = {
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  region?: unknown;
  postalCode?: unknown;
  country?: unknown;
  phone?: unknown;
  fullName?: unknown;
};

function isValidAddress(addr: OrderAddressInput | null | undefined): boolean {
  return Boolean(addr?.line1?.trim() && addr?.city?.trim());
}

function fromJson(value: Prisma.JsonValue | null | undefined): OrderAddressInput | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as JsonAddress;
  const line1 = typeof raw.line1 === 'string' ? raw.line1 : '';
  const city = typeof raw.city === 'string' ? raw.city : '';
  if (!line1.trim() || !city.trim()) {
    return null;
  }
  return {
    fullName: typeof raw.fullName === 'string' ? raw.fullName : null,
    line1,
    line2: typeof raw.line2 === 'string' ? raw.line2 : null,
    city,
    region: typeof raw.region === 'string' ? raw.region : null,
    postalCode: typeof raw.postalCode === 'string' ? raw.postalCode : null,
    country: typeof raw.country === 'string' ? raw.country : 'US',
    phone: typeof raw.phone === 'string' ? raw.phone : null,
  };
}

/**
 * Renewal address resolution (P14e):
 * (a) latest subscription Order SHIPPING+BILLING
 * (b) valid User.shippingAddress (copy for billing)
 * (c) fail — never invent placeholders
 */
@Injectable()
export class RenewalAddressResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async resolve(subscriptionId: string, patientUserId: string): Promise<{
    shipping: OrderAddressInput;
    billing: OrderAddressInput;
  }> {
    const fromOrder =
      await this.orders.getLatestSubscriptionOrderAddresses(subscriptionId);
    if (
      fromOrder &&
      isValidAddress(fromOrder.shipping) &&
      isValidAddress(fromOrder.billing)
    ) {
      return fromOrder;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: patientUserId },
      select: { shippingAddress: true },
    });
    const shipping = fromJson(user?.shippingAddress ?? null);
    if (shipping && isValidAddress(shipping)) {
      return {
        shipping,
        billing: { ...shipping },
      };
    }

    throw new BadRequestException({
      code: ErrorCodes.VAL_MISSING_FIELD,
      message:
        'Renewal addresses are missing: no valid latest order addresses or user shippingAddress',
    });
  }
}
