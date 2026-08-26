import 'reflect-metadata';

import { BadRequestException } from '@nestjs/common';

import { Permissions } from '../rbac/constants/permissions';
import { REQUIRE_PERMISSIONS_KEY } from '../rbac/constants/rbac.constants';
import { AdminPaymentProvidersController } from './admin-payment-providers.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { CrmPaymentsController } from './crm-payments.controller';

function requiredPermissions(
  controller: abstract new (...args: never[]) => unknown,
  method: string,
): string[] {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    return [];
  }
  const metadata: unknown = Reflect.getMetadata(
    REQUIRE_PERMISSIONS_KEY,
    handler,
  );
  return Array.isArray(metadata) ? (metadata as string[]) : [];
}

describe('Admin/CRM payment permissions', () => {
  it('uses PERM-ORD-001 for list/detail and PERM-PAY-003 for refunds', () => {
    expect(requiredPermissions(AdminPaymentsController, 'list')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(AdminPaymentsController, 'get')).toEqual([
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(AdminPaymentsController, 'refund')).toEqual([
      Permissions.PAY_INITIATE_REFUND,
    ]);
    expect(requiredPermissions(CrmPaymentsController, 'refund')).toEqual([
      Permissions.PAY_INITIATE_REFUND,
    ]);
    expect(requiredPermissions(AdminPaymentProvidersController, 'get')).toEqual(
      [Permissions.SET_OVERSELL_POLICIES],
    );
  });

  it('does not introduce PERM-PAY-004', () => {
    expect(Object.values(Permissions)).not.toContain('PERM-PAY-004');
  });

  it('requires Idempotency-Key on Guardian and CRM refunds', () => {
    const payments = { initiateRefund: jest.fn() };
    const admin = new AdminPaymentsController(payments as never);
    const crm = new CrmPaymentsController(payments as never);
    const user = { id: 'staff-1' };

    expect(() =>
      admin.refund(
        '11111111-1111-4111-8111-111111111111',
        { amountCents: 100, reason: 'test' },
        user as never,
        undefined,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      crm.refund(
        '11111111-1111-4111-8111-111111111111',
        { amountCents: 100, reason: 'test' },
        user as never,
        '   ',
      ),
    ).toThrow(BadRequestException);
    expect(payments.initiateRefund).not.toHaveBeenCalled();
  });
});
