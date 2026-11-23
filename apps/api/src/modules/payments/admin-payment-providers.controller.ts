import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import type { ProviderConfigResponseDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('admin-payment-providers')
@ApiBearerAuth()
@Controller({ path: 'admin/payment-providers', version: '1' })
export class AdminPaymentProvidersController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions(
    Permissions.GRD_ACCESS_SHELL,
    Permissions.SET_OVERSELL_POLICIES,
  )
  @ApiOperation({
    summary: 'Read-only payment provider metadata (no secrets)',
  })
  get(): ProviderConfigResponseDto {
    const raw = this.payments.getProviderConfig();
    // Explicit allow-list — never passthrough internal registry objects.
    return {
      provider: raw.provider,
      mode: raw.mode,
      capabilities: raw.capabilities,
      webhookEndpointUrl: raw.webhookEndpointUrl,
    };
  }
}
