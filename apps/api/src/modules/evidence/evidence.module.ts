import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller';
import { ExtractionService } from './extraction/extraction.service';
@Module({controllers:[EvidenceController],providers:[ExtractionService]}) export class EvidenceModule{}
