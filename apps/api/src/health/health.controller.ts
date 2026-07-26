import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { Public } from '../modules/auth/decorators/public.decorator';
import { HealthService } from './health.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Public()
@SkipTransform()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Application health check' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return this.healthService.getHealth();
  }
}
