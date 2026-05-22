import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

function readEnvValue(rawValue: string): string {
	const trimmed = rawValue.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function loadDotEnvFile(filePath: string): void {
	if (!fs.existsSync(filePath)) return;
	const content = fs.readFileSync(filePath, "utf8");
	for (const line of content.split(/\r?\n/)) {
		const trimmedLine = line.trim();
		if (!trimmedLine || trimmedLine.startsWith("#")) continue;
		const equalsIndex = trimmedLine.indexOf("=");
		if (equalsIndex <= 0) continue;
		const key = trimmedLine.slice(0, equalsIndex).trim();
		const value = readEnvValue(trimmedLine.slice(equalsIndex + 1));
		if (!key || process.env[key] !== undefined) continue;
		process.env[key] = value;
	}
}

loadDotEnvFile(path.join(__dirname, ".env.local"));

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: "list",
	use: {
		baseURL: process.env.SAAS_DASH_BASE_URL || "http://localhost:3010",
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER
		? undefined
		: process.env.SAAS_E2E_USE_BUILD === "1"
			? {
					command: "npm run build && npm run start",
					url: "http://localhost:3010/login",
					timeout: 300_000,
					reuseExistingServer: false,
					cwd: __dirname,
				}
			: {
					command: "npm run dev",
					url: "http://localhost:3010/login",
					timeout: 180_000,
					reuseExistingServer: true,
					cwd: __dirname,
				},
});
