"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeDataStep = executeDataStep;
exports.executeMigrationStep = executeMigrationStep;
exports.executeAppStep = executeAppStep;
exports.composeDownBestEffort = composeDownBestEffort;
async function executeDataStep(runner, ctx, options) {
    await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
        "up",
        "-d",
        "mysql",
        "mongo",
        "redis",
    ], options);
}
async function executeMigrationStep(runner, ctx, log, options) {
    log("database_migration");
    await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
        "run",
        "--rm",
        "database_migration",
    ], options);
}
async function executeAppStep(runner, ctx, options) {
    await runner.run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, [
        "up",
        "-d",
        "webapp",
        "nginx",
        "server",
    ], options);
}
async function composeDownBestEffort(runner, ctx) {
    const result = await runner
        // Provision rollback should remove anonymous/named volumes to avoid stale
        // MySQL credentials across retries (new secret vs old initialized volume).
        .run(ctx.composeFile, ctx.project, ctx.envPath, ctx.composeEnv, ["down", "--remove-orphans", "-v", "--timeout", "30"], { timeoutMs: 2 * 60 * 1000 })
        .then(() => true)
        .catch(() => false);
    return result;
}
