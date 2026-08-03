import { Injectable } from '@nestjs/common';
import { AssetStatus } from '../../../generated/prisma';
import { BadRequestException } from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';

/**
 * Uploaded → Active → Archived → Deleted (docs/33 §12).
 * V1: successful finalize auto-promotes Uploaded → Active.
 */
const ALLOWED: Record<AssetStatus, AssetStatus[]> = {
  [AssetStatus.UPLOADED]: [AssetStatus.ACTIVE, AssetStatus.DELETED],
  [AssetStatus.ACTIVE]: [AssetStatus.ARCHIVED, AssetStatus.DELETED],
  [AssetStatus.ARCHIVED]: [AssetStatus.ACTIVE, AssetStatus.DELETED],
  [AssetStatus.DELETED]: [AssetStatus.ACTIVE],
};

@Injectable()
export class AssetLifecycleService {
  assertTransition(from: AssetStatus, to: AssetStatus): void {
    if (from === to) {
      return;
    }
    if (!ALLOWED[from].includes(to)) {
      throw new BadRequestException({
        code: ErrorCodes.AST_INVALID_TRANSITION,
        message: `Invalid asset lifecycle transition: ${from} → ${to}`,
      });
    }
  }
}
