import { Module } from '@nestjs/common';
import { PassportsController } from './passports.controller';
import { PassportDataService } from './passport-data.service';
import { PassportExportController } from './passport-export.controller';
import { PassportExportService } from './passport-export.service';
import { ResolverModule } from '../resolver/resolver.module';
@Module({ imports: [ResolverModule], controllers: [PassportsController, PassportExportController],
  providers: [PassportDataService, PassportExportService], exports: [PassportDataService] })
export class PassportsModule {}
