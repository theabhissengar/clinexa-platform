import { BadRequestException, Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import type { SubscriptionEditContext } from './subscription.types';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';

export type SubscriptionEditableField =
  'shippingPreferenceNotes' | 'opsFlags' | 'adminTags' | 'reconciliationFlags';

const CRM_OPS: ReadonlySet<SubscriptionEditableField> = new Set([
  'shippingPreferenceNotes',
  'opsFlags',
]);

const GUARDIAN_ADMIN: ReadonlySet<SubscriptionEditableField> = new Set([
  'shippingPreferenceNotes',
  'opsFlags',
  'adminTags',
  'reconciliationFlags',
]);

/**
 * Domain edit allowlists by context + lifecycle (docs/36 §7).
 * AuthZ permissions are enforced at the API layer in P14c/d.
 */
@Injectable()
export class SubscriptionEditPolicyService {
  constructor(private readonly lifecycle: SubscriptionsLifecycleService) {}

  assertFieldAllowed(
    context: SubscriptionEditContext,
    status: SubscriptionStatus,
    field: SubscriptionEditableField,
  ): void {
    if (this.lifecycle.isTerminal(status)) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_UNKNOWN_FIELD,
        message: `Field ${field} cannot be edited on terminal status ${status}`,
      });
    }

    const allowlist = context === 'crm' ? CRM_OPS : GUARDIAN_ADMIN;
    if (!allowlist.has(field)) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_UNKNOWN_FIELD,
        message: `Field ${field} is not editable in ${context} context`,
      });
    }
  }

  assertNotImmutableSnapshotMutation(): never {
    throw new BadRequestException({
      code: ErrorCodes.VAL_UNKNOWN_FIELD,
      message:
        'Subscription item snapshots, prices, and customer history are immutable after bind',
    });
  }
}
