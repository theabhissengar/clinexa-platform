import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import {
  ClassDCouponReasonDto,
  CreateCouponDto,
  UpdateCouponDto,
} from './dto/coupon.dto';
import { CouponsService } from './coupons.service';

@ApiTags('admin-coupons')
@ApiBearerAuth()
@Controller({ path: 'admin/coupons', version: '1' })
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @RequirePermissions(Permissions.CPN_CONFIGURE)
  @ApiOperation({ summary: 'Guardian coupon list (API-143)' })
  list(
    @Query('q') q?: string,
    @Query('isActive') isActive?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.coupons.listCoupons({
      q,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      includeDeleted: includeDeleted === 'true' || includeDeleted === '1',
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Post()
  @RequirePermissions(Permissions.CPN_CONFIGURE)
  @ApiOperation({ summary: 'Create coupon (API-144)' })
  create(@Body() dto: CreateCouponDto) {
    const { applicability: _applicability, ...rest } = dto;
    void _applicability;
    return this.coupons.createCoupon({
      ...rest,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    });
  }

  @Get(':id/redemptions')
  @RequirePermissions(Permissions.CPN_CONFIGURE)
  @ApiOperation({ summary: 'Coupon redemptions (API-147)' })
  redemptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.coupons.listRedemptions(id, {
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get(':id')
  @RequirePermissions(Permissions.CPN_CONFIGURE)
  @ApiOperation({ summary: 'Coupon detail' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.coupons.getCoupon(
      id,
      includeDeleted === 'true' || includeDeleted === '1',
    );
  }

  @Patch(':id')
  @RequirePermissions(Permissions.CPN_CONFIGURE)
  @ApiOperation({ summary: 'Update coupon (API-145)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.coupons.updateCoupon(id, {
      ...dto,
      startsAt:
        dto.startsAt === undefined
          ? undefined
          : dto.startsAt === null
            ? null
            : new Date(dto.startsAt),
      endsAt:
        dto.endsAt === undefined
          ? undefined
          : dto.endsAt === null
            ? null
            : new Date(dto.endsAt),
    });
  }

  @Post(':id/deactivate')
  @RequirePermissions(Permissions.CPN_CONFIGURE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate coupon (API-146)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.deactivateCoupon(id);
  }

  @Post(':id/delete')
  @RequirePermissions(Permissions.CPN_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Class D coupon delete (PERM-CPN-010)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: ClassDCouponReasonDto,
  ) {
    void _dto;
    return this.coupons.deleteCoupon(id);
  }
}
