import { BadRequestException } from '@nestjs/common';
import { ProductLifecycleStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { ProductLifecycleService } from './product-lifecycle.service';

describe('ProductLifecycleService', () => {
  const service = new ProductLifecycleService();

  it('allows draft → published', () => {
    expect(() =>
      service.assertTransition(
        ProductLifecycleStatus.DRAFT,
        ProductLifecycleStatus.PUBLISHED,
      ),
    ).not.toThrow();
  });

  it('rejects published → draft', () => {
    expect(() =>
      service.assertTransition(
        ProductLifecycleStatus.PUBLISHED,
        ProductLifecycleStatus.DRAFT,
      ),
    ).toThrow(BadRequestException);
  });

  it('blocks Rx publish without questionnaire binding (OR-14)', () => {
    try {
      service.assertPublishSafety({
        isRxEligible: true,
        questionnaireBindingRef: null,
        slug: 'semaglutide',
        seoTitle: 'Semaglutide',
        variants: [{ deletedAt: null, isFulfillable: true }],
      });
      fail('expected publish safety to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        code: string;
      };
      expect(response.code).toBe(ErrorCodes.PRD_PUBLISH_UNSAFE);
    }
  });

  it('allows non-Rx publish with variant and SEO', () => {
    expect(() =>
      service.assertPublishSafety({
        isRxEligible: false,
        questionnaireBindingRef: null,
        slug: 'moisturizer',
        seoTitle: 'Moisturizer',
        variants: [{ deletedAt: null, isFulfillable: true }],
      }),
    ).not.toThrow();
  });

  it('requires at least one fulfillable variant', () => {
    expect(() =>
      service.assertPublishSafety({
        isRxEligible: false,
        questionnaireBindingRef: null,
        slug: 'empty',
        seoTitle: 'Empty',
        variants: [],
      }),
    ).toThrow(BadRequestException);
  });
});
