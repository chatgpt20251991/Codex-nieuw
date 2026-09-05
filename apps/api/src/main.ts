import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/http/zod-exception.filter';
import { BigIntInterceptor } from './common/http/bigint.interceptor';
import { PrismaExceptionFilter } from './common/http/prisma-exception.filter';

function assertProductionConfig(){
 if(process.env.NODE_ENV!=='production')return;
 if(process.env.AUTH_MODE!=='oidc')throw new Error('Production requires AUTH_MODE=oidc.');
 if(!process.env.RESOLVER_BASE_URL?.startsWith('https://'))throw new Error('Production RESOLVER_BASE_URL must be HTTPS.');
 if(!process.env.OIDC_ISSUER||!process.env.OIDC_AUDIENCE||!process.env.OIDC_JWKS_URL)throw new Error('Production OIDC settings are incomplete.');
}
async function bootstrap(){
 assertProductionConfig();
 const app=await NestFactory.create(AppModule,{bodyParser:true});
 app.use(helmet({contentSecurityPolicy:false}));
 const origins=(process.env.WEB_ORIGIN||'http://localhost:3000').split(',').map(x=>x.trim());
 app.enableCors({origin:origins,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS']});
 app.use((req:any,res:any,next:any)=>{const id=String(req.headers['x-request-id']||randomUUID());req.requestId=id;res.setHeader('X-Request-ID',id);next();});
 app.useGlobalFilters(new ZodExceptionFilter(), new PrismaExceptionFilter());
 app.useGlobalInterceptors(new BigIntInterceptor());
 app.setGlobalPrefix('v1');
 await app.listen(Number(process.env.PORT||4000),'0.0.0.0');
}
bootstrap();
