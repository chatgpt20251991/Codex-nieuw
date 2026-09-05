import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public() @Get()
  get() {
    // Report effective availability to the UI. An environment flag cannot
    // activate the absent live adapter or turn internal drafts into uploads.
    return { ok: true, service: 'eubatterypassport-api', version: '0.2.1', registryBatterySubmissionAvailable: false };
  }
}
