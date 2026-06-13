declare module '@nestjs/throttler' {
  import { CanActivate, DynamicModule, ExecutionContext } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';

  export function Throttle(...args: any[]): MethodDecorator & ClassDecorator;

  export class ThrottlerGuard implements CanActivate {
    protected readonly reflector: Reflector;
    constructor(options: any, storageService: any, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
    protected handleRequest(context: ExecutionContext, limit: number, ttl: number): Promise<boolean>;
  }

  export class ThrottlerModule {
    static forRoot(...args: any[]): DynamicModule;
    static forRootAsync(...args: any[]): DynamicModule;
  }
}
