declare module '@nestjs/bullmq' {
  import { DynamicModule } from '@nestjs/common';

  export const BullModule: {
    forRoot: (...args: any[]) => DynamicModule;
    forRootAsync: (...args: any[]) => DynamicModule;
    registerQueue: (...args: any[]) => DynamicModule;
  };

  export function Processor(...args: any[]): ClassDecorator;
  export function InjectQueue(...args: any[]): ParameterDecorator;
  export class WorkerHost<T = any> {
    process(job: any): Promise<void> | void;
  }
  export function OnWorkerEvent(...args: any[]): MethodDecorator;
}
