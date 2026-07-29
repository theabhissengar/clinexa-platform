import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

describe('Products Class D permission codes', () => {
  it('exposes distinct Class D delete codes not implied by manage', () => {
    expect(Permissions.PRD_DELETE).toBe('PERM-PRD-010');
    expect(Permissions.CAT_DELETE).toBe('PERM-CAT-010');
    expect(Permissions.PRD_DELETE).not.toBe(Permissions.PRD_MANAGE);
    expect(Permissions.CAT_DELETE).not.toBe(Permissions.CAT_MANAGE);
  });

  it('RequirePermissions decorator factory accepts Class D codes', () => {
    const decorator = RequirePermissions(Permissions.PRD_DELETE);
    expect(typeof decorator).toBe('function');
  });
});
