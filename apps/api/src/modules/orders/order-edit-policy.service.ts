import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import type { OrderEditContext } from './order.types';

export type OrderEditableField =
  | 'trackingNumber'
  | 'carrier'
  | 'shippedAt'
  | 'adminTags'
  | 'reconciliationFlags'
  | 'shippingPhone';

const CRM_OPS: ReadonlySet<OrderEditableField> = new Set([
  'trackingNumber',
  'carrier',
  'shippedAt',
  'shippingPhone',
]);

const GUARDIAN_ADMIN: ReadonlySet<OrderEditableField> = new Set([
  'trackingNumber',
  'carrier',
  'shippedAt',
  'shippingPhone',
  'adminTags',
  'reconciliationFlags',
]);

/**
 * Domain edit allowlists by context + lifecycle (docs/35 §7).
 * AuthZ permissions are enforced at the API layer in later phases.
 */
@Injectable()
export class OrderEditPolicyService {
  assertFieldAllowed(
    context: OrderEditContext,
    status: OrderStatus,
    field: OrderEditableField,
  ): void {
    if (status === OrderStatus.CANCELLED || status === OrderStatus.REFUNDED) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_EDIT_FORBIDDEN,
        message: `Field ${field} cannot be edited on terminal status ${status}`,
      });
    }

    const allowlist = context === 'crm' ? CRM_OPS : GUARDIAN_ADMIN;
    if (!allowlist.has(field)) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_EDIT_FORBIDDEN,
        message: `Field ${field} is not editable in ${context} context`,
      });
    }

    if (
      (field === 'trackingNumber' ||
        field === 'carrier' ||
        field === 'shippedAt') &&
      status !== OrderStatus.AWAITING_FULFILLMENT &&
      status !== OrderStatus.FULFILLED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_EDIT_FORBIDDEN,
        message: `Fulfillment fields require awaiting_fulfillment or fulfilled (got ${status})`,
      });
    }

    if (field === 'shippingPhone') {
      const allowAssist = new Set<OrderStatus>([
        OrderStatus.AWAITING_CLINICAL_REVIEW,
        OrderStatus.CLINICAL_APPROVED,
        OrderStatus.AWAITING_FULFILLMENT,
      ]);
      if (!allowAssist.has(status)) {
        throw new BadRequestException({
          code: ErrorCodes.ORD_EDIT_FORBIDDEN,
          message: `shippingPhone assist not allowed in status ${status}`,
        });
      }
    }
  }

  /** Draft allows Guardian admin path to rewrite addresses/lines via dedicated create/update APIs later. */
  isDraftMutable(status: OrderStatus): boolean {
    return status === OrderStatus.DRAFT;
  }

  assertNotImmutableSnapshotMutation(): never {
    throw new BadRequestException({
      code: ErrorCodes.ORD_IMMUTABLE,
      message:
        'Order item snapshots, prices, and customer/address history are immutable after finalize',
    });
  }
}
