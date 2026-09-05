import { Controller, Get } from '@nestjs/common'; import { Public } from '../../common/auth/public.decorator';
@Controller('health') export class HealthController{@Public() @Get() get(){return {ok:true,service:'eubatterypassport-api',version:'0.2.0',registryBatterySubmissionAvailable:process.env.REGISTRY_BATTERY_SUBMISSION_AVAILABLE==='true'};}}
