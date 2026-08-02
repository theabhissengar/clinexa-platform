import { UserStatus } from '../../../generated/prisma';

import { UserLifecycleService } from './user-lifecycle.service';

describe('UserLifecycleService', () => {
  const service = new UserLifecycleService();

  it('allows active ⇄ suspended and active ⇄ inactive', () => {
    expect(() =>
      service.assertTransition(UserStatus.ACTIVE, UserStatus.SUSPENDED),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(UserStatus.SUSPENDED, UserStatus.ACTIVE),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(UserStatus.ACTIVE, UserStatus.INACTIVE),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(UserStatus.INACTIVE, UserStatus.ACTIVE),
    ).not.toThrow();
  });

  it('allows archive from active/inactive/suspended and restore to active', () => {
    expect(() =>
      service.assertTransition(UserStatus.ACTIVE, UserStatus.ARCHIVED),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(UserStatus.ARCHIVED, UserStatus.ACTIVE),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(UserStatus.ARCHIVED, UserStatus.DELETED),
    ).not.toThrow();
  });

  it('rejects illegal transitions', () => {
    expect(() =>
      service.assertTransition(UserStatus.DELETED, UserStatus.ACTIVE),
    ).toThrow();
    expect(() =>
      service.assertTransition(UserStatus.ACTIVE, UserStatus.DELETED),
    ).toThrow();
  });

  it('treats only ACTIVE as auth-allowed', () => {
    expect(service.isAuthAllowed(UserStatus.ACTIVE)).toBe(true);
    expect(service.isAuthAllowed(UserStatus.SUSPENDED)).toBe(false);
    expect(service.isAuthAllowed(UserStatus.INACTIVE)).toBe(false);
    expect(service.isAuthAllowed(UserStatus.ARCHIVED)).toBe(false);
  });
});
