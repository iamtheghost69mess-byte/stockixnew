"use client";

import { useEffect, useRef } from "react";

import { usePathname } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";

import { posQueryKeys } from "@/lib/pos-query-keys";
import { acquirePosSocket, releasePosSocket } from "@/lib/pos-socket";
import { usePosAuthStore } from "@/stores/pos-auth-store";

const LOGIN_PATH = "/login";

/**
 * Subscribes to tenant POS Socket.IO events using cookie-based authentication.
 * Bumps React Query caches when backend events are received.
 */
export function PosRealtimeBridge() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const user = usePosAuthStore((s) => s.user);
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  useEffect(() => {
    // Only connect if user is authenticated and not on the login page
    if (pathname === LOGIN_PATH || !user) {
      return undefined;
    }

    const socket = acquirePosSocket();

    const bumpOrdersAndFloor = () => {
      const qc = qcRef.current;
      void qc.invalidateQueries({ queryKey: posQueryKeys.tables(null) });
      void qc.invalidateQueries({ queryKey: posQueryKeys.orders.all() });
      void qc.invalidateQueries({ queryKey: posQueryKeys.kitchenOrders() });
      void qc.invalidateQueries({ queryKey: ["open-order-for-table"] });
      void qc.invalidateQueries({ queryKey: ["open-order-admin"] });
      void qc.invalidateQueries({ queryKey: ["open-order-preview"] });
    };

    const bumpInventory = () => {
      const qc = qcRef.current;
      void qc.invalidateQueries({ queryKey: posQueryKeys.inventory() });
      void qc.invalidateQueries({ queryKey: posQueryKeys.menuInventoryAvailability("") });
      void qc.invalidateQueries({ queryKey: posQueryKeys.inventoryPolicy() });
    };

    const bumpCatalog = () => {
      const qc = qcRef.current;
      void qc.invalidateQueries({ queryKey: posQueryKeys.menuCategories() });
      void qc.invalidateQueries({ queryKey: posQueryKeys.menuItems() });
    };

    const bumpNotifications = () => {
      const qc = qcRef.current;
      void qc.invalidateQueries({ queryKey: ["accounting", "notifications"] });
    };

    socket.on("order:updated", bumpOrdersAndFloor);
    socket.on("order:new", bumpOrdersAndFloor);
    socket.on("table:status-changed", bumpOrdersAndFloor);
    socket.on("inventory:low-stock", bumpInventory);
    socket.on("inventory:updated", bumpInventory);
    socket.on("catalog:updated", bumpCatalog);
    socket.on("notifications:updated", bumpNotifications);

    return () => {
      socket.off("order:updated", bumpOrdersAndFloor);
      socket.off("order:new", bumpOrdersAndFloor);
      socket.off("table:status-changed", bumpOrdersAndFloor);
      socket.off("inventory:low-stock", bumpInventory);
      socket.off("inventory:updated", bumpInventory);
      socket.off("catalog:updated", bumpCatalog);
      socket.off("notifications:updated", bumpNotifications);
      releasePosSocket();
    };
  }, [pathname, user]);

  return null;
}
