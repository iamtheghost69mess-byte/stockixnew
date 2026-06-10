declare module '@nestjs/throttler' {
  import { CanActivate, DynamicModule } from '@nestjs/common';

  export function Throttle(...args: any[]): MethodDecorator & ClassDecorator;

  export class ThrottlerGuard implements CanActivate {
    canActivate(context: any): boolean | Promise<boolean>;
  }

  export class ThrottlerModule {
    static forRoot(...args: any[]): DynamicModule;
    static forRootAsync(...args: any[]): DynamicModule;
  }
}
