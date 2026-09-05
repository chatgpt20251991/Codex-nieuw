import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'; import { map } from 'rxjs/operators';
function clean(value:any):any{if(typeof value==='bigint')return value.toString();if(Array.isArray(value))return value.map(clean);if(value&&typeof value==='object'&&!(value instanceof Date)){return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));}return value;}
@Injectable() export class BigIntInterceptor implements NestInterceptor {intercept(_ctx:ExecutionContext,next:CallHandler){return next.handle().pipe(map(clean));}}
