import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

describe('Asset Library Class D permission codes', () => {
  it('exposes distinct Class D codes not implied by manage', () => {
    expect(Permissions.AST_VIEW).toBe('PERM-AST-001');
    expect(Permissions.AST_MANAGE).toBe('PERM-AST-002');
    expect(Permissions.AST_DESTRUCTIVE).toBe('PERM-AST-010');
    expect(Permissions.AST_BULK_DESTRUCTIVE).toBe('PERM-AST-011');
    expect(Permissions.AST_DESTRUCTIVE).not.toBe(Permissions.AST_MANAGE);
    expect(Permissions.AST_BULK_DESTRUCTIVE).not.toBe(Permissions.AST_MANAGE);
  });

  it('RequirePermissions decorator factory accepts Class D codes', () => {
    const decorator = RequirePermissions(Permissions.AST_DESTRUCTIVE);
    expect(typeof decorator).toBe('function');
  });
});
