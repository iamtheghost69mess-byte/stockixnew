"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecaDockerComposeRunner = void 0;
const execa_1 = require("execa");
class ExecaDockerComposeRunner {
    async run(composeFile, project, envFile, composeEnv, args, options) {
        const execaOptions = {
            env: composeEnv,
            stdio: "pipe",
            extendEnv: true,
            forceKillAfterDelay: 500,
            timeout: options?.timeoutMs,
        };
        const subprocess = (0, execa_1.execa)("docker", ["compose", "-f", composeFile, "-p", project, "--env-file", envFile, ...args], execaOptions);
        let abortHandler;
        const cancelSignal = options?.cancelSignal;
        if (cancelSignal) {
            abortHandler = () => {
                // Use forceful termination to avoid lingering docker compose subprocesses
                // during cancellation on Windows shells.
                if (process.platform === "win32" && typeof subprocess.pid === "number") {
                    void (0, execa_1.execa)("taskkill", ["/PID", String(subprocess.pid), "/T", "/F"]).catch(() => undefined);
                    return;
                }
                subprocess.kill("SIGKILL");
            };
            if (cancelSignal.aborted) {
                abortHandler();
            }
            else {
                cancelSignal.addEventListener("abort", abortHandler, { once: true });
            }
        }
        try {
            await subprocess;
        }
        finally {
            if (cancelSignal && abortHandler) {
                cancelSignal.removeEventListener("abort", abortHandler);
            }
        }
    }
}
exports.ExecaDockerComposeRunner = ExecaDockerComposeRunner;
