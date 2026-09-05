import { Module } from '@nestjs/common'; import { AccessController } from './access.controller'; import { AccessTokenService } from './access-token.service';
@Module({controllers:[AccessController],providers:[AccessTokenService]}) export class AccessModule{}
