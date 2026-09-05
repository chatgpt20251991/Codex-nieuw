import { Module } from '@nestjs/common';
import { RegistryController } from './registry.controller';
import { RegistryIdentityService } from './registry-identity.service';
import { PassportsModule } from '../passports/passports.module';

@Module({
  imports:[PassportsModule],
  controllers:[RegistryController],
  providers:[RegistryIdentityService],
})
export class RegistryModule{}
