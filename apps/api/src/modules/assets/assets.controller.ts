import { Controller, Get, Query, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { AssetsService } from './assets.service';

@ApiTags('assets')
@Controller({ path: 'assets', version: '1' })
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get('file')
  @Public()
  @ApiOperation({ summary: 'Stream local Active asset object by storage key' })
  async streamLocal(@Query('key') key: string, @Res() res: Response) {
    const { body, mimeType, filename } =
      await this.assets.streamLocalObject(key);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/"/g, '')}"`,
    );
    res.send(body);
  }

  @Get(':id/resolve')
  @Public()
  @ApiOperation({
    summary: 'Resolve Active asset URL/stream metadata (ID-only consumers)',
  })
  resolve(@Param('id') id: string) {
    return this.assets.resolve(id);
  }
}
