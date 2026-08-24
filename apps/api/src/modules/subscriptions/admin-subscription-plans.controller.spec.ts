import { SubscriptionBillingInterval } from '../../../generated/prisma';

import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import type { SubscriptionPlansService } from './subscription-plans.service';

describe('AdminSubscriptionPlansController', () => {
  const plans = {
    listPlans: jest.fn(),
    getById: jest.fn(),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
  };

  const controller = new AdminSubscriptionPlansController(
    plans as unknown as SubscriptionPlansService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a draft plan through the plans service', async () => {
    plans.createPlan.mockResolvedValue({ id: 'plan-1' });
    await controller.create({
      name: 'Monthly',
      billingInterval: SubscriptionBillingInterval.MONTH,
      priceCents: 19900,
      productBindings: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
    });
    expect(plans.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Monthly',
        billingInterval: SubscriptionBillingInterval.MONTH,
        priceCents: 19900,
      }),
    );
  });

  it('publish/unpublish/archive/restore go through the plans service', async () => {
    plans.publish.mockResolvedValue({});
    plans.unpublish.mockResolvedValue({});
    plans.archive.mockResolvedValue({});
    plans.restore.mockResolvedValue({});

    await controller.publish('plan-1');
    await controller.unpublish('plan-1');
    await controller.archive('plan-1');
    await controller.restore('plan-1');

    expect(plans.publish).toHaveBeenCalledWith('plan-1');
    expect(plans.unpublish).toHaveBeenCalledWith('plan-1');
    expect(plans.archive).toHaveBeenCalledWith('plan-1');
    expect(plans.restore).toHaveBeenCalledWith('plan-1');
  });
});
