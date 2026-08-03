import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  AssetStatus,
  AssetUploadSessionStatus,
  Prisma,
  StorageProviderKind,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../infrastructure/storage/storage-provider.interface';
import { AssetLifecycleService } from './asset-lifecycle.service';
import type { CreateUploadSessionDto, UpdateAssetDto } from './dto/asset.dto';

/** Reusable business asset MIME allowlist (not Document Management / PHI). */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'image/avif',
]);

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: AssetLifecycleService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private maxBytes(): number {
    return (
      this.config.get<number>('storage.maxUploadBytes') ?? 10 * 1024 * 1024
    );
  }

  private sessionTtlMs(): number {
    const minutes =
      this.config.get<number>('storage.uploadSessionTtlMinutes') ?? 60;
    return minutes * 60 * 1000;
  }

  private assertMime(mimeType: string): void {
    if (!ALLOWED_MIME.has(mimeType.toLowerCase())) {
      throw new BadRequestException({
        code: ErrorCodes.AST_UPLOAD_REJECTED,
        message: `MIME type not allowed for Asset Library: ${mimeType}`,
      });
    }
  }

  private mapAsset(asset: {
    id: string;
    storageProvider: StorageProviderKind;
    storageKey: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    width: number | null;
    height: number | null;
    altText: string | null;
    caption: string | null;
    status: AssetStatus;
    createdByUserId: string | null;
    archivedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: asset.id,
      storageProvider: asset.storageProvider,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      altText: asset.altText,
      caption: asset.caption,
      status: asset.status,
      createdByUserId: asset.createdByUserId,
      archivedAt: asset.archivedAt,
      deletedAt: asset.deletedAt,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      // Never expose storageKey / provider URLs to consumers as durable refs.
    };
  }

  async listAdmin(params: {
    q?: string;
    status?: AssetStatus;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AssetWhereInput = {};
    if (params.status) {
      where.status = params.status;
    } else {
      where.status = { not: AssetStatus.DELETED };
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { originalFilename: { contains: q, mode: 'insensitive' } },
        { altText: { contains: q, mode: 'insensitive' } },
        { caption: { contains: q, mode: 'insensitive' } },
        { mimeType: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);

    const [items, total, statusGroups] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.asset.count({ where }),
      this.prisma.asset.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all]),
    ) as Record<string, number>;

    return {
      items: items.map((a) => this.mapAsset(a)),
      total,
      skip,
      take,
      statusCounts,
    };
  }

  async getAdminById(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.status === AssetStatus.DELETED) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Asset not found',
      });
    }
    return this.mapAsset(asset);
  }

  async createUploadSession(dto: CreateUploadSessionDto, actorId: string) {
    this.assertMime(dto.mimeType);
    const ext = this.extensionFor(dto.originalFilename, dto.mimeType);
    const storageKey = `assets/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;
    const session = await this.prisma.assetUploadSession.create({
      data: {
        storageProvider: this.storage.kind,
        storageKey,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType.toLowerCase(),
        createdByUserId: actorId,
        expiresAt: new Date(Date.now() + this.sessionTtlMs()),
      },
    });

    return {
      id: session.id,
      storageProvider: session.storageProvider,
      originalFilename: session.originalFilename,
      mimeType: session.mimeType,
      expiresAt: session.expiresAt,
      /** Local: client PUTs multipart/binary to this API path (provider-independent contract). */
      uploadPath: `/v1/admin/assets/upload-sessions/${session.id}/content`,
      status: session.status,
    };
  }

  async putSessionContent(
    sessionId: string,
    actorId: string,
    body: Buffer,
    contentType?: string,
  ) {
    const session = await this.requireOpenSession(sessionId, actorId);
    if (body.length === 0) {
      throw new BadRequestException({
        code: ErrorCodes.AST_UPLOAD_REJECTED,
        message: 'Empty upload body',
      });
    }
    if (body.length > this.maxBytes()) {
      throw new BadRequestException({
        code: ErrorCodes.AST_UPLOAD_REJECTED,
        message: `File exceeds max size of ${this.maxBytes()} bytes`,
      });
    }
    const mimeType = (contentType ?? session.mimeType).toLowerCase();
    this.assertMime(mimeType);

    try {
      await this.storage.putObject({
        key: session.storageKey,
        body,
        mimeType,
      });
    } catch {
      throw new BadRequestException({
        code: ErrorCodes.AST_STORAGE_FAILED,
        message: 'Failed to store upload',
      });
    }

    await this.prisma.assetUploadSession.update({
      where: { id: session.id },
      data: {
        status: AssetUploadSessionStatus.UPLOADED,
        byteSize: body.length,
        mimeType,
      },
    });

    return {
      id: session.id,
      status: AssetUploadSessionStatus.UPLOADED,
      byteSize: body.length,
    };
  }

  async finalizeSession(sessionId: string, actorId: string) {
    const session = await this.prisma.assetUploadSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.createdByUserId !== actorId) {
      throw new NotFoundException({
        code: ErrorCodes.AST_SESSION_INVALID,
        message: 'Upload session not found',
      });
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.assetUploadSession.update({
        where: { id: session.id },
        data: { status: AssetUploadSessionStatus.EXPIRED },
      });
      throw new BadRequestException({
        code: ErrorCodes.AST_SESSION_INVALID,
        message: 'Upload session expired',
      });
    }
    if (session.status !== AssetUploadSessionStatus.UPLOADED) {
      throw new BadRequestException({
        code: ErrorCodes.AST_SESSION_INVALID,
        message: `Upload session is ${session.status}; content must be uploaded first`,
      });
    }
    if (!(await this.storage.exists(session.storageKey))) {
      throw new BadRequestException({
        code: ErrorCodes.AST_STORAGE_FAILED,
        message: 'Uploaded object missing from storage',
      });
    }

    const byteSize = session.byteSize ?? 0;
    const asset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: {
          storageProvider: session.storageProvider,
          storageKey: session.storageKey,
          originalFilename: session.originalFilename,
          mimeType: session.mimeType,
          byteSize,
          status: AssetStatus.UPLOADED,
          createdByUserId: actorId,
        },
      });
      this.lifecycle.assertTransition(AssetStatus.UPLOADED, AssetStatus.ACTIVE);
      const activated = await tx.asset.update({
        where: { id: created.id },
        data: { status: AssetStatus.ACTIVE },
      });
      await tx.assetUploadSession.update({
        where: { id: session.id },
        data: { status: AssetUploadSessionStatus.FINALIZED },
      });
      await tx.assetChangeHistory.create({
        data: {
          assetId: activated.id,
          actorId,
          action: 'finalize',
          changes: {
            status: { from: AssetStatus.UPLOADED, to: AssetStatus.ACTIVE },
          },
        },
      });
      await tx.assetActivity.create({
        data: {
          assetId: activated.id,
          actorId,
          kind: 'upload',
          summary: `Uploaded ${activated.originalFilename}`,
        },
      });
      return activated;
    });

    return this.mapAsset(asset);
  }

  async updateMetadata(id: string, dto: UpdateAssetDto, actorId: string) {
    const existing = await this.requireMutableAsset(id);
    const data: Prisma.AssetUpdateInput = {};
    const changes: Record<string, { from: string | null; to: string | null }> =
      {};
    if (dto.altText !== undefined) {
      data.altText = dto.altText;
      changes.altText = { from: existing.altText, to: dto.altText };
    }
    if (dto.caption !== undefined) {
      data.caption = dto.caption;
      changes.caption = { from: existing.caption, to: dto.caption };
    }
    const updated = await this.prisma.asset.update({ where: { id }, data });
    await this.recordHistory(id, actorId, 'update_metadata', changes);
    await this.recordActivity(id, actorId, 'edit', 'Updated asset metadata');
    return this.mapAsset(updated);
  }

  async archive(id: string, actorId: string) {
    const existing = await this.requireMutableAsset(id);
    this.lifecycle.assertTransition(existing.status, AssetStatus.ARCHIVED);
    const updated = await this.prisma.asset.update({
      where: { id },
      data: { status: AssetStatus.ARCHIVED, archivedAt: new Date() },
    });
    await this.recordHistory(id, actorId, 'archive', {
      status: { from: existing.status, to: AssetStatus.ARCHIVED },
    });
    await this.recordActivity(id, actorId, 'archive', 'Archived asset');
    return this.mapAsset(updated);
  }

  async restore(id: string, actorId: string) {
    const existing = await this.prisma.asset.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Asset not found',
      });
    }
    this.lifecycle.assertTransition(existing.status, AssetStatus.ACTIVE);
    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        status: AssetStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
      },
    });
    await this.recordHistory(id, actorId, 'restore', {
      status: { from: existing.status, to: AssetStatus.ACTIVE },
    });
    await this.recordActivity(id, actorId, 'restore', 'Restored asset');
    return this.mapAsset(updated);
  }

  async softDelete(id: string, actorId: string) {
    const existing = await this.prisma.asset.findUnique({ where: { id } });
    if (!existing || existing.status === AssetStatus.DELETED) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Asset not found',
      });
    }
    this.lifecycle.assertTransition(existing.status, AssetStatus.DELETED);
    const updated = await this.prisma.asset.update({
      where: { id },
      data: { status: AssetStatus.DELETED, deletedAt: new Date() },
    });
    await this.recordHistory(id, actorId, 'delete', {
      status: { from: existing.status, to: AssetStatus.DELETED },
    });
    await this.recordActivity(id, actorId, 'delete', 'Soft-deleted asset');
    return this.mapAsset(updated);
  }

  async bulkDestructive(
    ids: string[],
    action: 'archive' | 'delete',
    actorId: string,
  ) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids) {
      try {
        if (action === 'archive') {
          await this.archive(id, actorId);
        } else {
          await this.softDelete(id, actorId);
        }
        results.push({ id, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : 'failed',
        });
      }
    }
    return { results };
  }

  async resolve(id: string, actorId?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.status !== AssetStatus.ACTIVE) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Asset not found or not active',
      });
    }
    const resolved = await this.storage.resolveUrl(
      asset.storageKey,
      asset.mimeType,
      asset.byteSize,
    );
    if (actorId) {
      await this.recordActivity(id, actorId, 'resolve', 'Resolved asset URL', {
        ephemeral: resolved.ephemeral,
      });
    }
    return {
      assetId: asset.id,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      altText: asset.altText,
      caption: asset.caption,
      url: resolved.url,
      ephemeral: resolved.ephemeral,
    };
  }

  async streamLocalObject(key: string) {
    const decoded = decodeURIComponent(key);
    if (!decoded.startsWith('assets/')) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Object not found',
      });
    }
    const asset = await this.prisma.asset.findFirst({
      where: {
        storageKey: decoded,
        storageProvider: StorageProviderKind.LOCAL,
        status: AssetStatus.ACTIVE,
      },
    });
    if (!asset) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Object not found',
      });
    }
    const obj = await this.storage.getObject(decoded);
    return {
      body: obj.body,
      mimeType: asset.mimeType,
      filename: asset.originalFilename,
    };
  }

  async listHistory(id: string) {
    await this.requireReadableAsset(id);
    return this.prisma.assetChangeHistory.findMany({
      where: { assetId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listActivity(id: string) {
    await this.requireReadableAsset(id);
    return this.prisma.assetActivity.findMany({
      where: { assetId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Picker foundation — Active assets only. */
  async listPicker(params: { q?: string; skip?: number; take?: number }) {
    return this.listAdmin({
      q: params.q,
      status: AssetStatus.ACTIVE,
      skip: params.skip,
      take: params.take,
    });
  }

  private async requireOpenSession(sessionId: string, actorId: string) {
    const session = await this.prisma.assetUploadSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.createdByUserId !== actorId) {
      throw new NotFoundException({
        code: ErrorCodes.AST_SESSION_INVALID,
        message: 'Upload session not found',
      });
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.assetUploadSession.update({
        where: { id: session.id },
        data: { status: AssetUploadSessionStatus.EXPIRED },
      });
      throw new BadRequestException({
        code: ErrorCodes.AST_SESSION_INVALID,
        message: 'Upload session expired',
      });
    }
    if (
      session.status !== AssetUploadSessionStatus.PENDING &&
      session.status !== AssetUploadSessionStatus.UPLOADED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.AST_SESSION_INVALID,
        message: `Upload session is ${session.status}`,
      });
    }
    return session;
  }

  private async requireMutableAsset(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.status === AssetStatus.DELETED) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Asset not found',
      });
    }
    return asset;
  }

  private async requireReadableAsset(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Asset not found',
      });
    }
    return asset;
  }

  private extensionFor(filename: string, mimeType: string): string {
    const fromName = filename.includes('.')
      ? filename.slice(filename.lastIndexOf('.'))
      : '';
    if (fromName && fromName.length <= 8) {
      return fromName.toLowerCase();
    }
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
      'image/avif': '.avif',
    };
    return map[mimeType.toLowerCase()] ?? '';
  }

  private async recordHistory(
    assetId: string,
    actorId: string | undefined,
    action: string,
    changes: Prisma.InputJsonValue,
  ) {
    await this.prisma.assetChangeHistory.create({
      data: { assetId, actorId, action, changes },
    });
  }

  private async recordActivity(
    assetId: string,
    actorId: string | undefined,
    kind: string,
    summary: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.assetActivity.create({
      data: { assetId, actorId, kind, summary, metadata },
    });
  }
}
