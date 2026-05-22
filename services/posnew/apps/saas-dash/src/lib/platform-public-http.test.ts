import { afterEach, describe, expect, it } from "vitest";

import {
	getPlatformRefreshToken,
	savePlatformRefreshToken,
	savePlatformToken,
} from "@/lib/platform-public-http";

const processEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = processEnv.NODE_ENV;

afterEach(() => {
	processEnv.NODE_ENV = originalNodeEnv;
	localStorage.clear();
});

describe("platform-public-http token storage", () => {
	it("does not persist refresh token outside development", () => {
		processEnv.NODE_ENV = "production";
		savePlatformRefreshToken("refresh-token");
		expect(getPlatformRefreshToken()).toBeNull();
	});

	it("persists refresh token in development", () => {
		processEnv.NODE_ENV = "development";
		savePlatformRefreshToken("refresh-token");
		expect(getPlatformRefreshToken()).toBe("refresh-token");
		savePlatformRefreshToken(undefined);
		expect(getPlatformRefreshToken()).toBeNull();
	});

	it("clears access token payload when undefined", () => {
		processEnv.NODE_ENV = "development";
		savePlatformToken("access");
		savePlatformToken(undefined);
		expect(localStorage.getItem("platform_access_token")).toBeNull();
	});
});
