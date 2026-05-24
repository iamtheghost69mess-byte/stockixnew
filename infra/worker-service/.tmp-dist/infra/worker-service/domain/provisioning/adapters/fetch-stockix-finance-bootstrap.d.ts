import type { ProvisionTracer } from "../../provision-trace.js";
import type { IStockixFinanceBootstrap } from "../contracts.js";
export declare class FetchStockixFinanceBootstrap implements IStockixFinanceBootstrap {
    waitUntilReady(internalBaseUrl: string, timeoutMs: number, log: (m: string) => void, requestId?: string, trace?: ProvisionTracer): Promise<void>;
    registerBootstrapAdmin(params: {
        internalBaseUrl: string;
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        log: (m: string) => void;
        requestId?: string;
        trace?: ProvisionTracer;
    }): Promise<void>;
}
//# sourceMappingURL=fetch-stockix-finance-bootstrap.d.ts.map