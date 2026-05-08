// @ts-nocheck
import { DependencyList, EffectCallback } from 'react';
import isDeepEqualReact from 'fast-deep-equal/react';
import { publicConfig } from '@/lib/public-config';
import { useCustomCompareEffect } from './useCustomCompareEffect';

const isPrimitive = (val: any) => val !== Object(val);

const useDeepCompareEffect = (effect: EffectCallback, deps: DependencyList) => {
  if (publicConfig.nodeEnv !== 'production') {
    if (!(deps instanceof Array) || !deps.length) {
      console.warn(
        '`useDeepCompareEffect` should not be used with no dependencies. Use React.useEffect instead.',
      );
    }

    if (deps.every(isPrimitive)) {
      console.warn(
        '`useDeepCompareEffect` should not be used with dependencies that are all primitive values. Use React.useEffect instead.',
      );
    }
  }
  useCustomCompareEffect(effect, deps, isDeepEqualReact);
};

export { useDeepCompareEffect };
