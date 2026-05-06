import { execa } from "execa";
import type { IDockerComposeRunner } from "../contracts.js";

export class ExecaDockerComposeRunner implements IDockerComposeRunner {
  async run(
    composeFile: string,
    project: string,
    envFile: string,
    composeEnv: Record<string, string>,
    args: string[],
  ): Promise<void> {
    await execa(
      "docker",
      ["compose", "-f", composeFile, "-p", project, "--env-file", envFile, ...args],
      { env: composeEnv, stdio: "pipe", extendEnv: true },
    );
  }
}
