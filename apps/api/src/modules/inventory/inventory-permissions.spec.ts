import { Permissions } from '../rbac/constants/permissions';

describe('Inventory permissions (P12)', () => {
  it('exposes split view / reserve / manage / Class D codes', () => {
    expect(Permissions.INV_VIEW).toBe('PERM-INV-001');
    expect(Permissions.INV_RESERVE).toBe('PERM-INV-002');
    expect(Permissions.INV_LOW_STOCK).toBe('PERM-INV-003');
    expect(Permissions.INV_MANAGE_STOCK).toBe('PERM-INV-004');
    expect(Permissions.INV_MANAGE_WAREHOUSE).toBe('PERM-INV-005');
    expect(Permissions.INV_DESTRUCTIVE).toBe('PERM-INV-010');
  });

  it('does not conflate adjust with reserve', () => {
    expect(Permissions.INV_RESERVE).not.toBe(Permissions.INV_MANAGE_STOCK);
  });
});
