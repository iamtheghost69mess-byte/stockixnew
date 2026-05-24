import { io, type Socket } from "socket.io-client";

import { getPosApiOrigin } from "@/config/pos-api";

let socketRef: Socket | null = null;
let socketUsers = 0;

export function acquirePosSocket(): Socket {
  if (!socketRef) {
    socketRef = io(getPosApiOrigin(), {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
    });
  }
  socketUsers += 1;
  return socketRef;
}

export function getPosSocket(): Socket {
  if (!socketRef) {
    socketRef = io(getPosApiOrigin(), {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
    });
  }
  return socketRef;
}

export function releasePosSocket() {
  socketUsers = Math.max(0, socketUsers - 1);
  if (socketUsers > 0) return;
  if (!socketRef) return;
  socketRef.disconnect();
  socketRef = null;
}

export function disconnectPosSocket() {
  socketUsers = 0;
  if (!socketRef) return;
  socketRef.disconnect();
  socketRef = null;
}
