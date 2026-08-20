import { BadRequestException } from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';
import { OrderTotalsService } from './order-totals.service';

describe('OrderTotalsService', () => {
  const service = new OrderTotalsService();

  it('computes line totals with sale price, discount, and tax in integer cents', () => {
    const line = service.computeLine({
      unitPriceCents: 1000,
      salePriceCents: 800,
      quantity: 2,
      discountCents: 100,
      taxCents: 50,
    });
    expect(line.lineSubtotalCents).toBe(1600);
    expect(line.lineTotalCents).toBe(1550);
  });

  it('rejects non-integer or negative money and invalid quantity', () => {
    expect(() =>
      service.computeLine({
        unitPriceCents: 10.5,
        salePriceCents: 10,
        quantity: 1,
      }),
    ).toThrow(BadRequestException);

    try {
      service.computeLine({
        unitPriceCents: 100,
        salePriceCents: 100,
        quantity: 0,
      });
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.ORD_INVALID_ITEM }),
      );
    }
  });

  it('aggregates order totals with shipping, tax, discount, and adjustments', () => {
    const lines = [
      service.computeLine({
        unitPriceCents: 1000,
        salePriceCents: 1000,
        quantity: 2,
      }),
      service.computeLine({
        unitPriceCents: 500,
        salePriceCents: 400,
        quantity: 1,
        discountCents: 0,
        taxCents: 0,
      }),
    ];
    const order = service.computeOrder({
      lines,
      shippingTotalCents: 500,
      discountTotalCents: 200,
      taxTotalCents: 100,
      adjustmentAmountsCents: [-50, 25],
    });
    expect(order.subtotalCents).toBe(2400);
    expect(order.adjustmentTotalCents).toBe(-25);
    expect(order.totalCents).toBe(2400 - 200 + 500 + 100 - 25);
  });

  it('rejects empty lines and oversize discounts', () => {
    expect(() => service.computeOrder({ lines: [] })).toThrow(
      BadRequestException,
    );
    const line = service.computeLine({
      unitPriceCents: 100,
      salePriceCents: 100,
      quantity: 1,
    });
    try {
      service.computeOrder({
        lines: [line],
        discountTotalCents: 200,
      });
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.ORD_INVALID_TOTALS }),
      );
    }
  });
});
