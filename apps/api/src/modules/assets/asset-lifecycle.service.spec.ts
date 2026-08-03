import { AssetStatus } from '../../../generated/prisma';
import { AssetLifecycleService } from './asset-lifecycle.service';

describe('AssetLifecycleService', () => {
  const service = new AssetLifecycleService();

  it('allows Uploaded → Active (finalize auto-promote)', () => {
    expect(() =>
      service.assertTransition(AssetStatus.UPLOADED, AssetStatus.ACTIVE),
    ).not.toThrow();
  });

  it('allows Active → Archived → Active and Active → Deleted', () => {
    expect(() =>
      service.assertTransition(AssetStatus.ACTIVE, AssetStatus.ARCHIVED),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(AssetStatus.ARCHIVED, AssetStatus.ACTIVE),
    ).not.toThrow();
    expect(() =>
      service.assertTransition(AssetStatus.ACTIVE, AssetStatus.DELETED),
    ).not.toThrow();
  });

  it('rejects Active → Uploaded', () => {
    expect(() =>
      service.assertTransition(AssetStatus.ACTIVE, AssetStatus.UPLOADED),
    ).toThrow();
  });
});
