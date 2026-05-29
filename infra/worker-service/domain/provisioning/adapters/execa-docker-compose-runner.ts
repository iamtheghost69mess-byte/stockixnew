import { execa } from "execa";
import type { IDockerComposeRunner } from "../contracts.js";

export class ExecaDockerComposeRunner implements IDockerComposeRunner {
  async run(
    composeFile: string,
    project: string,
    envFile: string,
    composeEnv: Record<string, string>,
    args: string[],
    options?: {
      cancelSignal?: AbortSignal;
      timeoutMs?: number;
      onOutput?: (chunk: string) => void;
    },
  ): Promise<void> {
    const execaOptions: Record<string, unknown> = {
      env: composeEnv,
      stdio: "pipe",
      extendEnv: true,
      forceKillAfterDelay: 500,
      timeout: options?.timeoutMs,
    };
    const subprocess = execa(
      "docker",
      ["compose", "-f", composeFile, "-p", project, "--env-file", envFile, ...args],
      execaOptions,
    );
    let abortHandler: (() => void) | undefined;
    const cancelSignal = options?.cancelSignal;
    if (cancelSignal) {
      abortHandler = () => {
        // Use forceful termination to avoid lingering docker compose subprocesses
        // during cancellation on Windows shells.
        if (process.platform === "win32" && typeof subprocess.pid === "number") {
          void execa("taskkill", ["/PID", String(subprocess.pid), "/T", "/F"]).catch(() => undefined);
          return;
        }
        subprocess.kill("SIGKILL");
      };
      if (cancelSignal.aborted) {
        abortHandler();
      } else {
        cancelSignal.addEventListener("abort", abortHandler, { once: true });
      }
    }
    const onOutput = options?.onOutput;
    if (onOutput && subprocess.stdout) {
      subprocess.stdout.on("data", (chunk: Buffer) => {
        onOutput(chunk.toString("utf8"));
      });
    }
    if (onOutput && subprocess.stderr) {
      subprocess.stderr.on("data", (chunk: Buffer) => {
        onOutput(chunk.toString("utf8"));
      });
    }
    try {
      await subprocess;
    } finally {
      if (cancelSignal && abortHandler) {
        cancelSignal.removeEventListener("abort", abortHandler);
      }
    }
  }
}
