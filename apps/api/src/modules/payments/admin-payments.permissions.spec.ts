import 'reflect-metadata';

import { BadRequestException } from '@nestjs/common';

import { Permissions } from '../rbac/constants/permissions';
import { REQUIRE_PERMISSIONS_KEY } from '../rbac/constants/rbac.constants';
import { ROLE_PERMISSION_MATRIX } from '../rbac/constants/role-permission-matrix';
import { Roles } from '../rbac/constants/roles';
import { AdminPaymentProvidersController } from './admin-payment-providers.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { CrmPaymentsController } from './crm-payments.controller';
import {
  AdminPaymentMethodsController,
  CrmPaymentMethodsController,
} from './payment-methods.controller';

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
  it('S1: Guardian list/detail require GRD_ACCESS_SHELL AND ORD_VIEW', () => {
    expect(requiredPermissions(AdminPaymentsController, 'list')).toEqual([
      Permissions.GRD_ACCESS_SHELL,
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(AdminPaymentsController, 'get')).toEqual([
      Permissions.GRD_ACCESS_SHELL,
      Permissions.ORD_VIEW,
    ]);
  });

  it('refunds require shell AND PAY_INITIATE_REFUND', () => {
    expect(requiredPermissions(AdminPaymentsController, 'refund')).toEqual([
      Permissions.GRD_ACCESS_SHELL,
      Permissions.PAY_INITIATE_REFUND,
    ]);
    expect(requiredPermissions(CrmPaymentsController, 'refund')).toEqual([
      Permissions.CRM_ACCESS_SHELL,
      Permissions.PAY_INITIATE_REFUND,
    ]);
  });

  it('Phase 7: providers require GRD_ACCESS_SHELL AND SET_OVERSELL_POLICIES', () => {
    expect(requiredPermissions(AdminPaymentProvidersController, 'get')).toEqual(
      [Permissions.GRD_ACCESS_SHELL, Permissions.SET_OVERSELL_POLICIES],
    );
  });

  it('Phase 7: staff reconcile requires GRD_ACCESS_SHELL AND ORD_EDIT', () => {
    expect(requiredPermissions(AdminPaymentsController, 'reconcile')).toEqual([
      Permissions.GRD_ACCESS_SHELL,
      Permissions.ORD_EDIT,
    ]);
  });

  it('Phase 7: PATIENT cannot satisfy reconcile AND (no shell / no ORD_EDIT alone enough)', () => {
    const patient = ROLE_PERMISSION_MATRIX[Roles.PATIENT];
    expect(patient).not.toContain(Permissions.GRD_ACCESS_SHELL);
    expect(patient).not.toContain(Permissions.ORD_EDIT);
    expect(patient).not.toContain(Permissions.SET_OVERSELL_POLICIES);
  });

  it('S2: admin/crm payments controllers no longer expose PAY_MANAGE method routes', () => {
    expect(
      typeof (
        AdminPaymentsController.prototype as {
          listUserPaymentMethods?: unknown;
        }
      ).listUserPaymentMethods,
    ).toBe('undefined');
    expect(
      typeof (
        CrmPaymentsController.prototype as { listUserPaymentMethods?: unknown }
      ).listUserPaymentMethods,
    ).toBe('undefined');
  });

  it('S3: staff payment-method controllers require shell AND resource perm', () => {
    expect(requiredPermissions(AdminPaymentMethodsController, 'list')).toEqual([
      Permissions.GRD_ACCESS_SHELL,
      Permissions.ORD_VIEW,
    ]);
    expect(requiredPermissions(AdminPaymentMethodsController, 'add')).toEqual([
      Permissions.GRD_ACCESS_SHELL,
      Permissions.ORD_EDIT,
    ]);
    expect(requiredPermissions(CrmPaymentMethodsController, 'list')).toEqual([
      Permissions.CRM_ACCESS_SHELL,
      Permissions.CRM_PATIENT_RECORDS,
    ]);
  });

  it('PATIENT lacks shell perms so cannot satisfy AND staff payment routes', () => {
    const patient = ROLE_PERMISSION_MATRIX[Roles.PATIENT];
    expect(patient).not.toContain(Permissions.GRD_ACCESS_SHELL);
    expect(patient).not.toContain(Permissions.CRM_ACCESS_SHELL);
    expect(patient).toContain(Permissions.ORD_VIEW);
    expect(patient).toContain(Permissions.PAY_MANAGE_METHODS);
  });

  it('does not introduce PERM-PAY-004', () => {
    expect(Object.values(Permissions)).not.toContain('PERM-PAY-004');
  });

  it('D9: PATIENT does not hold PERM-PAY-003 (staff-only refunds)', () => {
    expect(ROLE_PERMISSION_MATRIX[Roles.PATIENT]).not.toContain(
      Permissions.PAY_INITIATE_REFUND,
    );
    for (const role of [
      Roles.SUPPORT,
      Roles.OPERATIONS,
      Roles.ADMINISTRATOR,
      Roles.SUPER_ADMINISTRATOR,
    ]) {
      expect(ROLE_PERMISSION_MATRIX[role]).toContain(
        Permissions.PAY_INITIATE_REFUND,
      );
    }
    for (const role of [Roles.DOCTOR, Roles.PHARMACIST]) {
      expect(ROLE_PERMISSION_MATRIX[role]).not.toContain(
        Permissions.PAY_INITIATE_REFUND,
      );
    }
  });

  it('D10: rejects malformed Idempotency-Key values on Guardian and CRM refunds', () => {
    const payments = { initiateRefund: jest.fn() };
    const admin = new AdminPaymentsController(payments as never);
    const crm = new CrmPaymentsController(payments as never);
    const user = { id: 'staff-1' };
    const id = '11111111-1111-4111-8111-111111111111';
    const body = { amountCents: 100, reason: 'test' };

    for (const bad of ['bad key!', 'a'.repeat(129)]) {
      expect(() => admin.refund(id, body, user as never, bad)).toThrow(
        BadRequestException,
      );
      expect(() => crm.refund(id, body, user as never, bad)).toThrow(
        BadRequestException,
      );
    }
    expect(payments.initiateRefund).not.toHaveBeenCalled();
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
