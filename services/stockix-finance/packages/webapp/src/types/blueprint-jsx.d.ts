import 'react';

declare module 'react' {
  interface ComponentClass<P = {}, S = ComponentState> {
    displayName?: string;
  }
}

export {};