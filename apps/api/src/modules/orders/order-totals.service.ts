import { BadRequestException, Injectable } from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';

export type LineTotalsInput = {
  salePriceCents: number;
  quantity: number;
  discountCents?: number;
  taxCents?: number;
};

export type LineTotalsResult = {
  unitPriceCents: number;
  salePriceCents: number;
  quantity: number;
  discountCents: number;
  taxCents: number;
  lineSubtotalCents: number;
  lineTotalCents: number;
};

export type OrderTotalsInput = {
  lines: LineTotalsResult[];
  shippingTotalCents?: number;
  discountTotalCents?: number;
  taxTotalCents?: number;
  /** Signed adjustment amounts (Correct path). */
  adjustmentAmountsCents?: number[];
  refundedTotalCents?: number;
};

export type OrderTotalsResult = {
  subtotalCents: number;
  discountTotalCents: number;
  shippingTotalCents: number;
  taxTotalCents: number;
  adjustmentTotalCents: number;
  refundedTotalCents: number;
  totalCents: number;
};

function assertNonNegativeInt(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException({
      code: ErrorCodes.ORD_INVALID_TOTALS,
      message: `${field} must be a non-negative integer (cents)`,
    });
  }
  return value;
}

function assertInt(value: number, field: string): number {
  if (!Number.isInteger(value)) {
    throw new BadRequestException({
      code: ErrorCodes.ORD_INVALID_TOTALS,
      message: `${field} must be an integer (cents)`,
    });
  }
  return value;
}

/**
 * Deterministic integer-cents totals (docs/35 §12).
 * Clients never supply the grand total — only optional shipping/tax/discount inputs.
 */
@Injectable()
export class OrderTotalsService {
  computeLine(
    input: LineTotalsInput & { unitPriceCents: number },
  ): LineTotalsResult {
    const unitPriceCents = assertNonNegativeInt(
      input.unitPriceCents,
      'unitPriceCents',
    );
    const salePriceCents = assertNonNegativeInt(
      input.salePriceCents,
      'salePriceCents',
    );
    const quantity = assertNonNegativeInt(input.quantity, 'quantity');
    if (quantity < 1) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_ITEM,
        message: 'quantity must be at least 1',
      });
    }
    const discountCents = assertNonNegativeInt(
      input.discountCents ?? 0,
      'discountCents',
    );
    const taxCents = assertNonNegativeInt(input.taxCents ?? 0, 'taxCents');

    const lineSubtotalCents = salePriceCents * quantity;
    if (discountCents > lineSubtotalCents) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TOTALS,
        message: 'line discountCents cannot exceed line subtotal',
      });
    }
    const lineTotalCents = lineSubtotalCents - discountCents + taxCents;

    return {
      unitPriceCents,
      salePriceCents,
      quantity,
      discountCents,
      taxCents,
      lineSubtotalCents,
      lineTotalCents,
    };
  }

  computeOrder(input: OrderTotalsInput): OrderTotalsResult {
    if (!input.lines.length) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_ITEM,
        message: 'Order requires at least one line item',
      });
    }

    const subtotalCents = input.lines.reduce(
      (sum, line) => sum + line.lineSubtotalCents,
      0,
    );
    const discountTotalCents = assertNonNegativeInt(
      input.discountTotalCents ?? 0,
      'discountTotalCents',
    );
    const shippingTotalCents = assertNonNegativeInt(
      input.shippingTotalCents ?? 0,
      'shippingTotalCents',
    );
    const taxTotalCents = assertNonNegativeInt(
      input.taxTotalCents ?? 0,
      'taxTotalCents',
    );
    const refundedTotalCents = assertNonNegativeInt(
      input.refundedTotalCents ?? 0,
      'refundedTotalCents',
    );

    const adjustmentTotalCents = (input.adjustmentAmountsCents ?? []).reduce(
      (sum, amount) => sum + assertInt(amount, 'adjustmentAmountCents'),
      0,
    );

    if (discountTotalCents > subtotalCents) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TOTALS,
        message: 'discountTotalCents cannot exceed subtotalCents',
      });
    }

    const totalCents =
      subtotalCents -
      discountTotalCents +
      shippingTotalCents +
      taxTotalCents +
      adjustmentTotalCents;

    if (totalCents < 0) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TOTALS,
        message: 'totalCents cannot be negative',
      });
    }

    return {
      subtotalCents,
      discountTotalCents,
      shippingTotalCents,
      taxTotalCents,
      adjustmentTotalCents,
      refundedTotalCents,
      totalCents,
    };
  }
}
