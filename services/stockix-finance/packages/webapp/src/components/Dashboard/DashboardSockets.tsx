import { useEffect, useRef } from 'react';
import { useQueryClient } from 'react-query';
import { io, type Socket } from 'socket.io-client';
import { Intent } from '@blueprintjs/core';
import t from '@/hooks/query/types';
import { AppToaster } from '@/components';
import { useIsAuthenticated } from '@/hooks/state';

export function DashboardSockets() {
  const socket = useRef<Socket | null>(null);
  const client = useQueryClient();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    socket.current = io('/', {
      path: '/socket',
      transports: ['polling', 'websocket'],
      reconnection: false,
      timeout: 8000,
    });

    socket.current.on('connect_error', () => {
      // Non-fatal: Plaid/subscription push is optional for core accounting.
      socket.current?.close();
      socket.current = null;
    });

    socket.current.on('NEW_TRANSACTIONS_DATA', () => {
      client.invalidateQueries(t.ACCOUNTS);
      client.invalidateQueries(t.ACCOUNT_TRANSACTION);
      client.invalidateQueries(t.CASH_FLOW_ACCOUNTS);
      client.invalidateQueries(t.CASH_FLOW_TRANSACTIONS);

      AppToaster.show({
        message: 'The Plaid connected accounts have been updated.',
        intent: Intent.SUCCESS,
      });
    });

    socket.current.on('SUBSCRIPTION_CHANGED', () => {
      client.invalidateQueries('GetSubscriptions');
    });

    return () => {
      socket.current?.removeAllListeners();
      socket.current?.close();
      socket.current = null;
    };
  }, [client, isAuthenticated]);

  return null;
}
