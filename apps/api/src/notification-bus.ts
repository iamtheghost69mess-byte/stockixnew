import { EventEmitter } from "node:events";

import type { OwnerNotification } from "@repo/db/schema";

class NotificationBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(500);
  }

  emitNotification(ownerId: string, notification: OwnerNotification): void {
    this.emit(channel(ownerId), notification);
  }

  subscribeOwner(
    ownerId: string,
    handler: (notification: OwnerNotification) => void,
  ): () => void {
    const ch = channel(ownerId);
    this.on(ch, handler);
    return () => {
      this.off(ch, handler);
    };
  }
}

function channel(ownerId: string): string {
  return `owner:${ownerId}`;
}

export const notificationBus = new NotificationBus();
