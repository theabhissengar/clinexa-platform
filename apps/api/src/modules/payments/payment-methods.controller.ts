import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  AddSavedPaymentMethodDto,
  UpdateSavedPaymentMethodDto,
} from './dto/saved-payment-method.dto';
import { PaymentsService } from './payments.service';

@ApiTags('admin-payment-methods')
@ApiBearerAuth()
@Controller({ path: 'admin/users/:userId/payment-methods', version: '1' })
export class AdminPaymentMethodsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permissions.ORD_VIEW)
  @ApiOperation({ summary: 'List saved payment methods for a user (Guardian)' })
  list(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.payments.listSavedMethodsForUser(userId);
  }

  @Post()
  @RequirePermissions(Permissions.ORD_EDIT)
  @ApiOperation({ summary: 'Add simulated saved payment method (Guardian)' })
  add(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AddSavedPaymentMethodDto,
  ) {
    return this.payments.addSavedMethodForUser({
      userId,
      brand: dto.brand,
      last4: dto.last4,
      expMonth: dto.expMonth,
      expYear: dto.expYear,
      isDefault: dto.isDefault,
    });
  }

  @Patch(':methodId')
  @RequirePermissions(Permissions.ORD_EDIT)
  @ApiOperation({ summary: 'Update saved payment method metadata (Guardian)' })
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
    @Body() dto: UpdateSavedPaymentMethodDto,
  ) {
    return this.payments.updateSavedMethodMetadata(userId, methodId, dto);
  }

  @Post(':methodId/default')
  @RequirePermissions(Permissions.ORD_EDIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make saved payment method default (Guardian)' })
  makeDefault(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ) {
    return this.payments.setDefaultSavedMethod(userId, methodId);
  }

  @Delete(':methodId')
  @RequirePermissions(Permissions.ORD_EDIT)
  @ApiOperation({ summary: 'Soft-delete saved payment method (Guardian)' })
  remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ) {
    return this.payments.deleteSavedMethod(userId, methodId);
  }
}

@ApiTags('crm-payment-methods')
@ApiBearerAuth()
@Controller({ path: 'crm/users/:userId/payment-methods', version: '1' })
export class CrmPaymentMethodsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'List saved payment methods for a patient (CRM)' })
  list(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.payments.listSavedMethodsForUser(userId);
  }

  @Post()
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'Add simulated saved payment method (CRM)' })
  add(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AddSavedPaymentMethodDto,
  ) {
    return this.payments.addSavedMethodForUser({
      userId,
      brand: dto.brand,
      last4: dto.last4,
      expMonth: dto.expMonth,
      expYear: dto.expYear,
      isDefault: dto.isDefault,
    });
  }

  @Patch(':methodId')
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'Update saved payment method metadata (CRM)' })
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
    @Body() dto: UpdateSavedPaymentMethodDto,
  ) {
    return this.payments.updateSavedMethodMetadata(userId, methodId, dto);
  }

  @Post(':methodId/default')
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Make saved payment method default (CRM)' })
  makeDefault(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ) {
    return this.payments.setDefaultSavedMethod(userId, methodId);
  }

  @Delete(':methodId')
  @RequirePermissions(Permissions.CRM_PATIENT_RECORDS)
  @ApiOperation({ summary: 'Soft-delete saved payment method (CRM)' })
  remove(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('methodId', ParseUUIDPipe) methodId: string,
  ) {
    return this.payments.deleteSavedMethod(userId, methodId);
  }
}
