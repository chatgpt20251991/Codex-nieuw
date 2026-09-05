import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { EvidenceStorageService } from './evidence-storage.service';
@Global()
@Module({ providers: [StorageService, EvidenceStorageService], exports: [StorageService, EvidenceStorageService] })
export class StorageModule {}
