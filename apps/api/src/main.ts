import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/http/zod-exception.filter';
import { BigIntInterceptor } from './common/http/bigint.interceptor';
import { PrismaExceptionFilter } from './common/http/prisma-exception.filter';
import { assertProductionConfig } from './common/http/production-config';
import { securityMiddleware } from './common/http/security.middleware';

async function bootstrap(){
 assertProductionConfig();
 const app=await NestFactory.create(AppModule,{bodyParser:true});
 app.use(helmet());
 const origins=(process.env.WEB_ORIGIN||'http://localhost:3000').split(',').map(x=>x.trim());
 app.enableCors({origin:origins,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS']});
 app.use(securityMiddleware());
 app.useGlobalFilters(new ZodExceptionFilter(), new PrismaExceptionFilter());
 app.useGlobalInterceptors(new BigIntInterceptor());
 app.setGlobalPrefix('v1');
 await app.listen(Number(process.env.PORT||4000),'0.0.0.0');
}
bootstrap();
