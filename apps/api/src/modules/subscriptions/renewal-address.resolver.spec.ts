import { BadRequestException } from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';
import { RenewalAddressResolver } from './renewal-address.resolver';

describe('RenewalAddressResolver', () => {
  const orders = {
    getLatestSubscriptionOrderAddresses: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const resolver = new RenewalAddressResolver(
    prisma as never,
    orders as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers latest order addresses (a)', async () => {
    orders.getLatestSubscriptionOrderAddresses.mockResolvedValue({
      shipping: { line1: '1 Main', city: 'Austin', country: 'US' },
      billing: { line1: '1 Main', city: 'Austin', country: 'US' },
    });
    const result = await resolver.resolve('sub-1', 'user-1');
    expect(result.shipping.line1).toBe('1 Main');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to user shippingAddress and copies billing (b)', async () => {
    orders.getLatestSubscriptionOrderAddresses.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      shippingAddress: {
        line1: '9 Oak',
        city: 'Dallas',
        country: 'US',
      },
    });
    const result = await resolver.resolve('sub-1', 'user-1');
    expect(result.shipping.line1).toBe('9 Oak');
    expect(result.billing.line1).toBe('9 Oak');
  });

  it('fails clearly when no address exists (c)', async () => {
    orders.getLatestSubscriptionOrderAddresses.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ shippingAddress: null });
    await expect(resolver.resolve('sub-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    try {
      await resolver.resolve('sub-1', 'user-1');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.VAL_MISSING_FIELD }),
      );
    }
  });
});
