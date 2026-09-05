import { Module } from '@nestjs/common';
import { RegistryController } from './registry.controller';
import { RegistryIdentityService } from './registry-identity.service';
import { RegistryPreparationService } from './registry-preparation.service';
import { PassportsModule } from '../passports/passports.module';

@Module({
  imports:[PassportsModule],
  controllers:[RegistryController],
  providers:[RegistryIdentityService,RegistryPreparationService],
})
export class RegistryModule{}
