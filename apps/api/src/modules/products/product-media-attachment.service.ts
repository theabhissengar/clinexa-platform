import { Injectable, NotFoundException } from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ProductsService } from './products.service';

/**
 * Attaches Media Library asset references to products.
 * Does NOT upload binaries or issue signed URLs — Media Library owns that.
 */
@Injectable()
export class ProductMediaAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async list(productId: string) {
    await this.products.getAdminById(productId);
    return this.prisma.productMedia.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async attach(
    productId: string,
    input: { mediaAssetId: string; alt?: string; sortOrder?: number },
    actorId?: string,
  ) {
    await this.products.getAdminById(productId);

    const row = await this.prisma.productMedia.create({
      data: {
        productId,
        mediaAssetId: input.mediaAssetId,
        alt: input.alt,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    await this.prisma.productActivity.create({
      data: {
        productId,
        actorId,
        kind: 'media_attached',
        summary: `Media asset ${input.mediaAssetId} attached`,
        metadata: { mediaAssetId: input.mediaAssetId },
      },
    });

    return row;
  }

  async reorder(
    productId: string,
    orderedIds: string[],
  ) {
    await this.products.getAdminById(productId);
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.productMedia.updateMany({
          where: { id, productId },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.list(productId);
  }

  async detach(productId: string, mediaId: string, actorId?: string) {
    await this.products.getAdminById(productId);
    const existing = await this.prisma.productMedia.findFirst({
      where: { id: mediaId, productId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Product media association not found',
      });
    }
    await this.prisma.productMedia.delete({ where: { id: mediaId } });
    await this.prisma.productActivity.create({
      data: {
        productId,
        actorId,
        kind: 'media_detached',
        summary: `Media association removed`,
        metadata: { mediaId },
      },
    });
    return { id: mediaId, detached: true };
  }
}
