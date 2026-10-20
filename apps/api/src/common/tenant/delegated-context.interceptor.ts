import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { delegatedContext, type DelegatedContext } from './delegated-context';

@Injectable()
export class DelegatedContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const delegation: DelegatedContext | undefined = context.switchToHttp().getRequest().delegation;
    if (!delegation) return next.handle();
    // Subscribe within the context: entering it in a guard leaks state between
    // concurrent requests and does not reliably cover deferred Nest handlers.
    return new Observable(subscriber => delegatedContext.run(Object.freeze({ ...delegation }),
      () => next.handle().subscribe(subscriber)));
  }
}
