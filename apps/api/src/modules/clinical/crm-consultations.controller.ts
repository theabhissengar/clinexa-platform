import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { ClinicalOutcomesService } from './clinical-outcomes.service';
import { ClinicalDecisionDto } from './dto/clinical-decision.dto';

/**
 * P14g thin Clinical decision surface (API-090 / API-091).
 * Opaque consultationId correlation only — not clinical record SoT.
 */
@ApiTags('crm-consultations')
@ApiBearerAuth()
@Controller({ path: 'crm/consultations', version: '1' })
export class CrmConsultationsController {
  constructor(private readonly clinical: ClinicalOutcomesService) {}

  @Post(':id/approve')
  @RequirePermissions(Permissions.CRM_APPROVE_RX)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Clinical approve (API-090). Opaque consultationId → Order clinical transitions + capture hook.',
  })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClinicalDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clinical.approve({
      consultationId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
    });
  }

  @Post(':id/decline')
  @RequirePermissions(Permissions.CRM_DECLINE_RX)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Clinical decline (API-091). Opaque consultationId → CLINICAL_DECLINED + void/Release + DECLINED_HOLD.',
  })
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClinicalDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clinical.decline({
      consultationId: id,
      actorUserId: user.id,
      reason: dto.reason ?? null,
    });
  }
}
