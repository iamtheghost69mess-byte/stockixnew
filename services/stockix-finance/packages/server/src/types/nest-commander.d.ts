declare module 'nest-commander' {
  import { ModuleMetadata, Type } from '@nestjs/common';

  export class CommandRunner {
    run(inputs: string[], options?: Record<string, unknown>): Promise<void>;
  }

  export function Command(options: { name: string; description?: string }): ClassDecorator;
  export function Option(options: Record<string, unknown>): PropertyDecorator;

  export class CommandRunnerModule {
    static forModule(options: ModuleMetadata): Type<unknown>;
  }

  export class CommandFactory {
    static run(module: Type<unknown>, options?: Record<string, unknown>): Promise<void>;
  }
}
