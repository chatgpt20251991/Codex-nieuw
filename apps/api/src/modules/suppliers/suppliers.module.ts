import { Module } from '@nestjs/common'; import { SuppliersController } from './suppliers.controller'; import { SupplierTokenService } from './supplier-token.service';
@Module({controllers:[SuppliersController],providers:[SupplierTokenService]}) export class SuppliersModule{}
