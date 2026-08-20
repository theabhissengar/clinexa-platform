import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { OrderEditPolicyService } from './order-edit-policy.service';

describe('OrderEditPolicyService', () => {
  const service = new OrderEditPolicyService();

  it('allows CRM fulfillment fields in awaiting_fulfillment', () => {
    expect(() =>
      service.assertFieldAllowed(
        'crm',
        OrderStatus.AWAITING_FULFILLMENT,
        'trackingNumber',
      ),
    ).not.toThrow();
  });

  it('forbids CRM from editing Guardian admin fields', () => {
    try {
      service.assertFieldAllowed(
        'crm',
        OrderStatus.AWAITING_FULFILLMENT,
        'adminTags',
      );
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.ORD_EDIT_FORBIDDEN }),
      );
    }
  });

  it('forbids edits on cancelled orders', () => {
    expect(() =>
      service.assertFieldAllowed(
        'guardian',
        OrderStatus.CANCELLED,
        'trackingNumber',
      ),
    ).toThrow(BadRequestException);
  });

  it('exposes immutable snapshot guard', () => {
    try {
      service.assertNotImmutableSnapshotMutation();
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.ORD_IMMUTABLE }),
      );
    }
  });
});
