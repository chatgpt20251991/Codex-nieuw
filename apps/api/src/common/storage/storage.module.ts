import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { MalwareScannerService } from './malware-scanner.service';
@Global()
@Module({ providers: [StorageService, EvidenceStorageService, MalwareScannerService], exports: [StorageService, EvidenceStorageService] })
export class StorageModule {}
