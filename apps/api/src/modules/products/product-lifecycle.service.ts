import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductLifecycleStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';

type PublishableProduct = {
  isRxEligible: boolean;
  questionnaireBindingRef: string | null;
  slug: string;
  seoTitle: string | null;
  variants: Array<{ deletedAt: Date | null; isFulfillable: boolean }>;
};

const ALLOWED: Record<ProductLifecycleStatus, ProductLifecycleStatus[]> = {
  [ProductLifecycleStatus.DRAFT]: [
    ProductLifecycleStatus.REVIEW,
    ProductLifecycleStatus.PUBLISHED,
    ProductLifecycleStatus.ARCHIVED,
  ],
  [ProductLifecycleStatus.REVIEW]: [
    ProductLifecycleStatus.DRAFT,
    ProductLifecycleStatus.PUBLISHED,
    ProductLifecycleStatus.ARCHIVED,
  ],
  [ProductLifecycleStatus.PUBLISHED]: [
    ProductLifecycleStatus.UNPUBLISHED,
    ProductLifecycleStatus.ARCHIVED,
  ],
  [ProductLifecycleStatus.UNPUBLISHED]: [
    ProductLifecycleStatus.DRAFT,
    ProductLifecycleStatus.REVIEW,
    ProductLifecycleStatus.PUBLISHED,
    ProductLifecycleStatus.ARCHIVED,
  ],
  [ProductLifecycleStatus.ARCHIVED]: [
    ProductLifecycleStatus.DRAFT,
    ProductLifecycleStatus.UNPUBLISHED,
  ],
};

@Injectable()
export class ProductLifecycleService {
  assertTransition(
    from: ProductLifecycleStatus,
    to: ProductLifecycleStatus,
  ): void {
    if (from === to) {
      return;
    }
    if (!ALLOWED[from].includes(to)) {
      throw new BadRequestException({
        code: ErrorCodes.PRD_INVALID_TRANSITION,
        message: `Invalid lifecycle transition: ${from} → ${to}`,
      });
    }
  }

  /**
   * OR-14 publish safety. Questionnaire bindings remain owned by QST;
   * Products only requires an opaque binding ref for Rx products.
   */
  assertPublishSafety(product: PublishableProduct): void {
    const issues: string[] = [];

    if (!product.slug?.trim()) {
      issues.push('slug is required');
    }
    if (!product.seoTitle?.trim()) {
      issues.push('seoTitle is required to publish');
    }

    const sellable = product.variants.filter(
      (v) => v.deletedAt == null && v.isFulfillable,
    );
    if (sellable.length < 1) {
      issues.push('at least one fulfillable variant is required');
    }

    if (product.isRxEligible && !product.questionnaireBindingRef?.trim()) {
      issues.push(
        'Rx-eligible products require questionnaireBindingRef before publish (OR-14)',
      );
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.PRD_PUBLISH_UNSAFE,
        message: 'Publish safety validation failed',
        details: issues,
      });
    }
  }
}
