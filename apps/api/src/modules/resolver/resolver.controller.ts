import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common'; import { PrismaService } from '../../prisma/prisma.service'; import { Public } from '../../common/auth/public.decorator'; import { ResolverService } from './resolver.service';
@Controller('public/b')
export class ResolverController {constructor(private readonly prisma:PrismaService,private readonly resolver:ResolverService){}
 @Public() @Get(':publicId') async passport(@Param('publicId') publicId:string){const rows=await this.prisma.$queryRaw<any[]>`SELECT get_public_passport_snapshot(${publicId}) AS data`;const data=rows?.[0]?.data;if(!data)throw new NotFoundException({code:'PUBLIC_PASSPORT_NOT_FOUND'});return data;}
 @Public() @Get(':publicId/qr.svg') @Header('Content-Type','image/svg+xml; charset=utf-8') async qr(@Param('publicId') publicId:string){const rows=await this.prisma.$queryRaw<any[]>`SELECT get_public_passport_snapshot(${publicId}) AS data`;const data=rows?.[0]?.data;if(!data?.battery?.upi)throw new NotFoundException({code:'PUBLIC_PASSPORT_NOT_FOUND'});return this.resolver.qrSvg(String(data.battery.upi));}
}
