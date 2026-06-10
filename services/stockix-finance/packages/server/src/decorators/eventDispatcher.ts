import { EventDispatcher as EventDispatcherClass } from 'event-dispatch';

export function EventDispatcher() {
  return (object: unknown, propertyName: string, index?: number): void => {
    const eventDispatcher = new EventDispatcherClass();
    if (typeof index === 'number' && object && typeof object === 'object') {
      (object as Record<string, unknown>)[propertyName] = eventDispatcher;
    }
  };
}

export { EventDispatcher as EventDispatcherInterface } from 'event-dispatch';
