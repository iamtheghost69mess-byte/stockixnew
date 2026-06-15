import postgres from "postgres";

import { emitProvisionEvent } from "../provision-bus.js";
import {
  PROVISION_NOTIFY_CHANNEL,
  type ProvisionEventPayload,
} from "../provision-trace.js";

export function startProvisionNotifyListener(
  connectionString: string,
  log: (message: string) => void,
): () => void {
  const sql = postgres(connectionString, { max: 1 });

  void sql
    .listen(PROVISION_NOTIFY_CHANNEL, (payload) => {
      try {
        const parsed = JSON.parse(payload) as ProvisionEventPayload;
        if (parsed?.correlationId && parsed?.id) {
          emitProvisionEvent(parsed);
        }
      } catch (error) {
        log(
          `[provision-notify] invalid payload: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    })
    .catch((error) => {
      log(
        `[provision-notify] LISTEN failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

  return () => {
    void sql.end({ timeout: 5 }).catch(() => undefined);
  };
}
