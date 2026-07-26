import { Controller, Get } from '@nestjs/common';

import { Public } from '../../src/modules/auth/decorators/public.decorator';

/**
 * E2E-only controller so tests can assert success envelope meta.correlationId
 * without shipping a production ping route.
 */
@Public()
@Controller({ path: 'observability-probe', version: '1' })
export class ObservabilityProbeController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}
