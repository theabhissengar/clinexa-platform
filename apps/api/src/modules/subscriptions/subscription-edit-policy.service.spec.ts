import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { SubscriptionEditPolicyService } from './subscription-edit-policy.service';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';

describe('SubscriptionEditPolicyService', () => {
  const service = new SubscriptionEditPolicyService(
    new SubscriptionsLifecycleService(),
  );

  it('allows CRM ops fields and forbids Guardian-only fields in CRM', () => {
    expect(() =>
      service.assertFieldAllowed(
        'crm',
        SubscriptionStatus.ACTIVE,
        'shippingPreferenceNotes',
      ),
    ).not.toThrow();
    try {
      service.assertFieldAllowed('crm', SubscriptionStatus.ACTIVE, 'adminTags');
      fail('expected throw');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: ErrorCodes.VAL_UNKNOWN_FIELD,
      });
    }
  });

  it('forbids edits on terminal subscriptions and snapshot mutation', () => {
    expect(() =>
      service.assertFieldAllowed(
        'guardian',
        SubscriptionStatus.CANCELLED,
        'opsFlags',
      ),
    ).toThrow(BadRequestException);
    try {
      service.assertNotImmutableSnapshotMutation();
      fail('expected throw');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: ErrorCodes.VAL_UNKNOWN_FIELD,
      });
    }
  });
});
