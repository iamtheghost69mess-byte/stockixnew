var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../infra/worker-service/src/worker.ts
import { randomUUID } from "crypto";
import { execa as execa3 } from "execa";

// ../../packages/config/src/index.ts
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { z } from "zod";
var configDir = path.dirname(fileURLToPath(import.meta.url));
var monorepoRoot = path.join(configDir, "..", "..", "..");
var preferredEnvPath = existsSync(path.join(monorepoRoot, ".env.local")) ? path.join(monorepoRoot, ".env.local") : path.join(monorepoRoot, ".env");
loadEnv({ path: preferredEnvPath, override: false });
var optionalStringSchema = z.string().min(1).optional();
var stringSchema = z.string().min(1);
var numberSchema = z.coerce.number().finite();
var booleanStringSchema = z.enum(["true", "false", "1", "0"]).optional();
function parseValue(schema, value, name) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`[config] invalid ${name}: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }
  return result.data;
}
function readOptionalString(name) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(optionalStringSchema, normalized.length > 0 ? normalized : void 0, name);
}
function readString(name, fallback) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  const resolved = normalized.length > 0 ? normalized : fallback;
  return parseValue(stringSchema, resolved, name);
}
function readRequiredString(name) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim() : "";
  return parseValue(stringSchema, normalized, name);
}
function readNumber(name, fallback) {
  const raw = process.env[name];
  const resolved = raw === void 0 || raw === null || raw === "" ? fallback : raw;
  return parseValue(numberSchema, resolved, name);
}
function readBooleanLike(name) {
  const raw = process.env[name];
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return parseValue(booleanStringSchema, normalized.length > 0 ? normalized : void 0, name);
}
function parseOrigins(raw) {
  if (!raw) return [];
  return raw.split(",").map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error(`[config] invalid CORS origin: ${origin}`);
    }
  });
}
function validateRequiredEnvForProfile(profile) {
  const requiredByProfile = {
    development: [],
    test: [],
    staging: ["DATABASE_URL", "PLATFORM_API_SECRET", "SESSION_SECRET", "DASHBOARD_URL", "AUTH_TOKEN_SECRET"],
    production: ["DATABASE_URL", "PLATFORM_API_SECRET", "WORKER_SECRET", "SESSION_SECRET", "DASHBOARD_URL", "AUTH_TOKEN_SECRET"]
  };
  const required = requiredByProfile[profile] ?? requiredByProfile.production ?? [];
  const missing = required.filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`[config] missing required env for ${profile}: ${missing.join(", ")}`);
  }
}
var env = {
  DATABASE_URL: readOptionalString("DATABASE_URL"),
  DB_WAIT_TIMEOUT_MS: readNumber("DB_WAIT_TIMEOUT_MS", 9e4),
  PORT: readNumber("PORT", 4e3),
  PLATFORM_API_SECRET: readOptionalString("PLATFORM_API_SECRET"),
  DASHBOARD_URL: readOptionalString("DASHBOARD_URL"),
  BOOTSTRAP_ADMIN_EMAIL: readOptionalString("BOOTSTRAP_ADMIN_EMAIL"),
  BOOTSTRAP_ADMIN_PASSWORD: readOptionalString("BOOTSTRAP_ADMIN_PASSWORD"),
  ROOT_DOMAIN: readOptionalString("ROOT_DOMAIN"),
  PUBLIC_BASE_URL_SCHEME: readString("PUBLIC_BASE_URL_SCHEME", "http").toLowerCase(),
  MAX_TENANT_PORT: readNumber("MAX_TENANT_PORT", 4999),
  STOCKIX_TENANT_APP_ROOT: readOptionalString("STOCKIX_TENANT_APP_ROOT"),
  REPO_ROOT: readOptionalString("REPO_ROOT"),
  TENANT_ENV_ROOT: readOptionalString("TENANT_ENV_ROOT"),
  TRAEFIK_DYNAMIC_DIR: readString("TRAEFIK_DYNAMIC_DIR", "/opt/stockix/traefik-dynamic"),
  TRAEFIK_TENANT_UPSTREAM_HOST: readString("TRAEFIK_TENANT_UPSTREAM_HOST", "host.docker.internal"),
  TENANT_INTERNAL_HOST: readString("TENANT_INTERNAL_HOST", "127.0.0.1"),
  CORS_ORIGINS: readOptionalString("CORS_ORIGINS"),
  SESSION_SECRET: readOptionalString("SESSION_SECRET"),
  AUTH_TOKEN_SECRET: readOptionalString("AUTH_TOKEN_SECRET"),
  ALLOW_BOOTSTRAP_LOGIN: readBooleanLike("ALLOW_BOOTSTRAP_LOGIN"),
  PLATFORM_ADMIN_EMAIL: readOptionalString("PLATFORM_ADMIN_EMAIL"),
  PLATFORM_ADMIN_PASSWORD: readOptionalString("PLATFORM_ADMIN_PASSWORD"),
  NEXT_PUBLIC_STOCKIX_API_URL: readString("NEXT_PUBLIC_STOCKIX_API_URL", "http://localhost:4000"),
  NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME: readString("NEXT_PUBLIC_STOCKIX_PUBLIC_SCHEME", "http"),
  NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN: readString("NEXT_PUBLIC_STOCKIX_ROOT_DOMAIN", "localhost"),
  NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST: readString("NEXT_PUBLIC_STOCKIX_LOCAL_TENANT_HOST", "127.0.0.1"),
  SECURITY_HSTS: readString("SECURITY_HSTS", "max-age=31536000; includeSubDomains"),
  SECURITY_X_FRAME_OPTIONS: readString("SECURITY_X_FRAME_OPTIONS", "DENY"),
  SECURITY_REFERRER_POLICY: readString("SECURITY_REFERRER_POLICY", "strict-origin-when-cross-origin"),
  SECURITY_X_CONTENT_TYPE_OPTIONS: readString("SECURITY_X_CONTENT_TYPE_OPTIONS", "nosniff"),
  SECURITY_CSP_BASE: readString(
    "SECURITY_CSP_BASE",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  ),
  STOCKIX_API_URL: readString("STOCKIX_API_URL", "http://localhost:4000"),
  PROVISION_POLL_MS: readNumber("PROVISION_POLL_MS", 2e3),
  PROVISION_MAX_MS: readNumber("PROVISION_MAX_MS", 45 * 60 * 1e3),
  OWNER_ID: readOptionalString("OWNER_ID"),
  PROVISION_ADMIN_EMAIL: readString("PROVISION_ADMIN_EMAIL", "admin@localhost"),
  POSTGRES_USER: readOptionalString("POSTGRES_USER"),
  POSTGRES_PASSWORD: readOptionalString("POSTGRES_PASSWORD"),
  POSTGRES_DB: readOptionalString("POSTGRES_DB"),
  POSTGRES_HOST_PORT: readOptionalString("POSTGRES_HOST_PORT"),
  ACME_EMAIL: readOptionalString("ACME_EMAIL"),
  CF_DNS_API_TOKEN: readOptionalString("CF_DNS_API_TOKEN"),
  STOCKIX_REPO: readOptionalString("STOCKIX_REPO"),
  NODE_ENV: readString("NODE_ENV", "development"),
  HOSTNAME: readString("HOSTNAME", "server"),
  PLAYWRIGHT_TEST_BASE_URL: readOptionalString("PLAYWRIGHT_TEST_BASE_URL"),
  SMOKE_OWNER_ID: readOptionalString("SMOKE_OWNER_ID"),
  SIGNUP_DISABLED: readBooleanLike("SIGNUP_DISABLED"),
  SIGNUP_ALLOWED_DOMAINS: readOptionalString("SIGNUP_ALLOWED_DOMAINS"),
  SIGNUP_ALLOWED_EMAILS: readOptionalString("SIGNUP_ALLOWED_EMAILS"),
  BROWSER_WS_ENDPOINT: readOptionalString("BROWSER_WS_ENDPOINT"),
  METRICS_ENDPOINT: readOptionalString("METRICS_ENDPOINT"),
  METRICS_AUTH_TOKEN: readOptionalString("METRICS_AUTH_TOKEN"),
  MONOREPO_VERSION: readOptionalString("MONOREPO_VERSION"),
  PUBLIC_URL: readOptionalString("PUBLIC_URL"),
  WORKER_SECRET: readString("WORKER_SECRET", "dev-worker-secret"),
  WORKER_JOB_ID: readOptionalString("WORKER_JOB_ID"),
  DB_CLIENT: readOptionalString("DB_CLIENT"),
  DB_HOST: readOptionalString("DB_HOST"),
  DB_USER: readOptionalString("DB_USER"),
  DB_PASSWORD: readOptionalString("DB_PASSWORD"),
  DB_CHARSET: readOptionalString("DB_CHARSET"),
  SYSTEM_DB_CLIENT: readOptionalString("SYSTEM_DB_CLIENT"),
  SYSTEM_DB_HOST: readOptionalString("SYSTEM_DB_HOST"),
  SYSTEM_DB_USER: readOptionalString("SYSTEM_DB_USER"),
  SYSTEM_DB_PASSWORD: readOptionalString("SYSTEM_DB_PASSWORD"),
  SYSTEM_DB_NAME: readOptionalString("SYSTEM_DB_NAME"),
  SYSTEM_DB_CHARSET: readOptionalString("SYSTEM_DB_CHARSET"),
  TENANT_DB_CLIENT: readOptionalString("TENANT_DB_CLIENT"),
  TENANT_DB_NAME_PREFIX: readOptionalString("TENANT_DB_NAME_PREFIX"),
  TENANT_DB_NAME_PERFIX: readOptionalString("TENANT_DB_NAME_PERFIX"),
  TENANT_DB_HOST: readOptionalString("TENANT_DB_HOST"),
  TENANT_DB_USER: readOptionalString("TENANT_DB_USER"),
  TENANT_DB_PASSWORD: readOptionalString("TENANT_DB_PASSWORD"),
  TENANT_DB_CHARSET: readOptionalString("TENANT_DB_CHARSET"),
  MAIL_HOST: readOptionalString("MAIL_HOST"),
  MAIL_PORT: readOptionalString("MAIL_PORT"),
  MAIL_SECURE: readBooleanLike("MAIL_SECURE"),
  MAIL_USERNAME: readOptionalString("MAIL_USERNAME"),
  MAIL_PASSWORD: readOptionalString("MAIL_PASSWORD"),
  DEPLOYMENT_SECRET_KEY: readOptionalString("DEPLOYMENT_SECRET_KEY"),
  MAIL_FROM_NAME: readOptionalString("MAIL_FROM_NAME"),
  MAIL_FROM_ADDRESS: readOptionalString("MAIL_FROM_ADDRESS"),
  MONGODB_DATABASE_URL: readOptionalString("MONGODB_DATABASE_URL"),
  AGENDA_DB_COLLECTION: readOptionalString("AGENDA_DB_COLLECTION"),
  AGENDA_POOL_TIME: readOptionalString("AGENDA_POOL_TIME"),
  AGENDA_CONCURRENCY: readOptionalString("AGENDA_CONCURRENCY"),
  AGENDASH_AUTH_USER: readOptionalString("AGENDASH_AUTH_USER"),
  AGENDASH_AUTH_PASSWORD: readOptionalString("AGENDASH_AUTH_PASSWORD"),
  EASY_SMS_TOKEN: readOptionalString("EASY_SMS_TOKEN"),
  JWT_SECRET: readOptionalString("JWT_SECRET"),
  BASE_URL: readOptionalString("BASE_URL"),
  npm_package_json: readOptionalString("npm_package_json"),
  npm_package_type: readOptionalString("npm_package_type")
};
var apiConfig = {
  get databaseUrl() {
    return env.DATABASE_URL ?? readRequiredString("DATABASE_URL");
  },
  get platformApiSecret() {
    return env.PLATFORM_API_SECRET ?? readRequiredString("PLATFORM_API_SECRET");
  },
  get workerSecret() {
    return env.WORKER_SECRET;
  },
  get dashboardUrl() {
    return env.DASHBOARD_URL ?? readRequiredString("DASHBOARD_URL");
  },
  get rootDomain() {
    return env.ROOT_DOMAIN;
  },
  get corsOrigins() {
    return parseOrigins(env.CORS_ORIGINS);
  },
  get port() {
    return env.PORT;
  },
  get publicBaseUrlScheme() {
    return env.PUBLIC_BASE_URL_SCHEME;
  },
  get maxTenantPort() {
    return env.MAX_TENANT_PORT;
  },
  get tenantInternalHost() {
    return env.TENANT_INTERNAL_HOST;
  },
  get tenantEnvRoot() {
    return env.TENANT_ENV_ROOT;
  },
  get repoRoot() {
    return env.REPO_ROOT;
  },
  get stockixTenantAppRoot() {
    return env.STOCKIX_TENANT_APP_ROOT;
  },
  get traefikDynamicDir() {
    return env.TRAEFIK_DYNAMIC_DIR;
  },
  get traefikTenantUpstreamHost() {
    return env.TRAEFIK_TENANT_UPSTREAM_HOST;
  },
  get bootstrapAdminEmail() {
    return env.BOOTSTRAP_ADMIN_EMAIL;
  },
  get bootstrapAdminPassword() {
    return env.BOOTSTRAP_ADMIN_PASSWORD;
  },
  get nodeEnv() {
    return env.NODE_ENV;
  },
  get sessionSecret() {
    return env.SESSION_SECRET ?? readRequiredString("SESSION_SECRET");
  },
  get authTokenSecret() {
    return env.AUTH_TOKEN_SECRET ?? env.SESSION_SECRET ?? readRequiredString("AUTH_TOKEN_SECRET");
  },
  get allowBootstrapLogin() {
    return env.ALLOW_BOOTSTRAP_LOGIN === "true" || env.ALLOW_BOOTSTRAP_LOGIN === "1";
  },
  get hostname() {
    return env.HOSTNAME;
  },
  get workerJobId() {
    return env.WORKER_JOB_ID;
  },
  get metricsEndpoint() {
    return env.METRICS_ENDPOINT;
  },
  get metricsAuthToken() {
    return env.METRICS_AUTH_TOKEN;
  },
  get deploymentSecretKey() {
    const raw = env.DEPLOYMENT_SECRET_KEY ?? readRequiredString("DEPLOYMENT_SECRET_KEY");
    if (raw.length < 32) {
      throw new Error("[config] DEPLOYMENT_SECRET_KEY must be at least 32 characters");
    }
    return createHash("sha256").update(raw).digest("hex");
  },
  get tenantDbNamePrefix() {
    return env.TENANT_DB_NAME_PREFIX ?? env.TENANT_DB_NAME_PERFIX;
  },
  validateRequiredEnv() {
    validateRequiredEnvForProfile(env.NODE_ENV);
  }
};

// ../../packages/db/src/index.ts
import { drizzle } from "drizzle-orm/postgres-js";

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js
import os from "os";
import fs from "fs";

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/query.js
var originCache = /* @__PURE__ */ new Map();
var originStackCache = /* @__PURE__ */ new Map();
var originError = /* @__PURE__ */ Symbol("OriginError");
var CLOSE = {};
var Query = class extends Promise {
  constructor(strings, args, handler, canceller, options = {}) {
    let resolve, reject;
    super((a, b2) => {
      resolve = a;
      reject = b2;
    });
    this.tagged = Array.isArray(strings.raw);
    this.strings = strings;
    this.args = args;
    this.handler = handler;
    this.canceller = canceller;
    this.options = options;
    this.state = null;
    this.statement = null;
    this.resolve = (x) => (this.active = false, resolve(x));
    this.reject = (x) => (this.active = false, reject(x));
    this.active = false;
    this.cancelled = null;
    this.executed = false;
    this.signature = "";
    this[originError] = this.handler.debug ? new Error() : this.tagged && cachedError(this.strings);
  }
  get origin() {
    return (this.handler.debug ? this[originError].stack : this.tagged && originStackCache.has(this.strings) ? originStackCache.get(this.strings) : originStackCache.set(this.strings, this[originError].stack).get(this.strings)) || "";
  }
  static get [Symbol.species]() {
    return Promise;
  }
  cancel() {
    return this.canceller && (this.canceller(this), this.canceller = null);
  }
  simple() {
    this.options.simple = true;
    this.options.prepare = false;
    return this;
  }
  async readable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  async writable() {
    this.simple();
    this.streaming = true;
    return this;
  }
  cursor(rows = 1, fn) {
    this.options.simple = false;
    if (typeof rows === "function") {
      fn = rows;
      rows = 1;
    }
    this.cursorRows = rows;
    if (typeof fn === "function")
      return this.cursorFn = fn, this;
    let prev;
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (this.executed && !this.active)
            return { done: true };
          prev && prev();
          const promise = new Promise((resolve, reject) => {
            this.cursorFn = (value) => {
              resolve({ value, done: false });
              return new Promise((r) => prev = r);
            };
            this.resolve = () => (this.active = false, resolve({ done: true }));
            this.reject = (x) => (this.active = false, reject(x));
          });
          this.execute();
          return promise;
        },
        return() {
          prev && prev(CLOSE);
          return { done: true };
        }
      })
    };
  }
  describe() {
    this.options.simple = false;
    this.onlyDescribe = this.options.prepare = true;
    return this;
  }
  stream() {
    throw new Error(".stream has been renamed to .forEach");
  }
  forEach(fn) {
    this.forEachFn = fn;
    this.handle();
    return this;
  }
  raw() {
    this.isRaw = true;
    return this;
  }
  values() {
    this.isRaw = "values";
    return this;
  }
  async handle() {
    !this.executed && (this.executed = true) && await 1 && this.handler(this);
  }
  execute() {
    this.handle();
    return this;
  }
  then() {
    this.handle();
    return super.then.apply(this, arguments);
  }
  catch() {
    this.handle();
    return super.catch.apply(this, arguments);
  }
  finally() {
    this.handle();
    return super.finally.apply(this, arguments);
  }
};
function cachedError(xs) {
  if (originCache.has(xs))
    return originCache.get(xs);
  const x = Error.stackTraceLimit;
  Error.stackTraceLimit = 4;
  originCache.set(xs, new Error());
  Error.stackTraceLimit = x;
  return originCache.get(xs);
}

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/errors.js
var PostgresError = class extends Error {
  constructor(x) {
    super(x.message);
    this.name = this.constructor.name;
    Object.assign(this, x);
  }
};
var Errors = {
  connection,
  postgres,
  generic,
  notSupported
};
function connection(x, options, socket) {
  const { host, port } = socket || options;
  const error = Object.assign(
    new Error("write " + x + " " + (options.path || host + ":" + port)),
    {
      code: x,
      errno: x,
      address: options.path || host
    },
    options.path ? {} : { port }
  );
  Error.captureStackTrace(error, connection);
  return error;
}
function postgres(x) {
  const error = new PostgresError(x);
  Error.captureStackTrace(error, postgres);
  return error;
}
function generic(code, message) {
  const error = Object.assign(new Error(code + ": " + message), { code });
  Error.captureStackTrace(error, generic);
  return error;
}
function notSupported(x) {
  const error = Object.assign(
    new Error(x + " (B) is not supported"),
    {
      code: "MESSAGE_NOT_SUPPORTED",
      name: x
    }
  );
  Error.captureStackTrace(error, notSupported);
  return error;
}

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/types.js
var types = {
  string: {
    to: 25,
    from: null,
    // defaults to string
    serialize: (x) => "" + x
  },
  number: {
    to: 0,
    from: [21, 23, 26, 700, 701],
    serialize: (x) => "" + x,
    parse: (x) => +x
  },
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (x) => JSON.stringify(x),
    parse: (x) => JSON.parse(x)
  },
  boolean: {
    to: 16,
    from: 16,
    serialize: (x) => x === true ? "t" : "f",
    parse: (x) => x === "t"
  },
  date: {
    to: 1184,
    from: [1082, 1114, 1184],
    serialize: (x) => (x instanceof Date ? x : new Date(x)).toISOString(),
    parse: (x) => new Date(x)
  },
  bytea: {
    to: 17,
    from: 17,
    serialize: (x) => "\\x" + Buffer.from(x).toString("hex"),
    parse: (x) => Buffer.from(x.slice(2), "hex")
  }
};
var NotTagged = class {
  then() {
    notTagged();
  }
  catch() {
    notTagged();
  }
  finally() {
    notTagged();
  }
};
var Identifier = class extends NotTagged {
  constructor(value) {
    super();
    this.value = escapeIdentifier(value);
  }
};
var Parameter = class extends NotTagged {
  constructor(value, type, array) {
    super();
    this.value = value;
    this.type = type;
    this.array = array;
  }
};
var Builder = class extends NotTagged {
  constructor(first, rest) {
    super();
    this.first = first;
    this.rest = rest;
  }
  build(before, parameters, types2, options) {
    const keyword = builders.map(([x, fn]) => ({ fn, i: before.search(x) })).sort((a, b2) => a.i - b2.i).pop();
    return keyword.i === -1 ? escapeIdentifiers(this.first, options) : keyword.fn(this.first, this.rest, parameters, types2, options);
  }
};
function handleValue(x, parameters, types2, options) {
  let value = x instanceof Parameter ? x.value : x;
  if (value === void 0) {
    x instanceof Parameter ? x.value = options.transform.undefined : value = x = options.transform.undefined;
    if (value === void 0)
      throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
  }
  return "$" + types2.push(
    x instanceof Parameter ? (parameters.push(x.value), x.array ? x.array[x.type || inferType(x.value)] || x.type || firstIsString(x.value) : x.type) : (parameters.push(x), inferType(x))
  );
}
var defaultHandlers = typeHandlers(types);
function stringify(q, string, value, parameters, types2, options) {
  for (let i = 1; i < q.strings.length; i++) {
    string += stringifyValue(string, value, parameters, types2, options) + q.strings[i];
    value = q.args[i];
  }
  return string;
}
function stringifyValue(string, value, parameters, types2, o) {
  return value instanceof Builder ? value.build(string, parameters, types2, o) : value instanceof Query ? fragment(value, parameters, types2, o) : value instanceof Identifier ? value.value : value && value[0] instanceof Query ? value.reduce((acc, x) => acc + " " + fragment(x, parameters, types2, o), "") : handleValue(value, parameters, types2, o);
}
function fragment(q, parameters, types2, options) {
  q.fragment = true;
  return stringify(q, q.strings[0], q.args[0], parameters, types2, options);
}
function valuesBuilder(first, parameters, types2, columns, options) {
  return first.map(
    (row) => "(" + columns.map(
      (column) => stringifyValue("values", row[column], parameters, types2, options)
    ).join(",") + ")"
  ).join(",");
}
function values(first, rest, parameters, types2, options) {
  const multi = Array.isArray(first[0]);
  const columns = rest.length ? rest.flat() : Object.keys(multi ? first[0] : first);
  return valuesBuilder(multi ? first : [first], parameters, types2, columns, options);
}
function select(first, rest, parameters, types2, options) {
  typeof first === "string" && (first = [first].concat(rest));
  if (Array.isArray(first))
    return escapeIdentifiers(first, options);
  let value;
  const columns = rest.length ? rest.flat() : Object.keys(first);
  return columns.map((x) => {
    value = first[x];
    return (value instanceof Query ? fragment(value, parameters, types2, options) : value instanceof Identifier ? value.value : handleValue(value, parameters, types2, options)) + " as " + escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x);
  }).join(",");
}
var builders = Object.entries({
  values,
  in: (...xs) => {
    const x = values(...xs);
    return x === "()" ? "(null)" : x;
  },
  select,
  as: select,
  returning: select,
  "\\(": select,
  update(first, rest, parameters, types2, options) {
    return (rest.length ? rest.flat() : Object.keys(first)).map(
      (x) => escapeIdentifier(options.transform.column.to ? options.transform.column.to(x) : x) + "=" + stringifyValue("values", first[x], parameters, types2, options)
    );
  },
  insert(first, rest, parameters, types2, options) {
    const columns = rest.length ? rest.flat() : Object.keys(Array.isArray(first) ? first[0] : first);
    return "(" + escapeIdentifiers(columns, options) + ")values" + valuesBuilder(Array.isArray(first) ? first : [first], parameters, types2, columns, options);
  }
}).map(([x, fn]) => [new RegExp("((?:^|[\\s(])" + x + "(?:$|[\\s(]))(?![\\s\\S]*\\1)", "i"), fn]);
function notTagged() {
  throw Errors.generic("NOT_TAGGED_CALL", "Query not called as a tagged template literal");
}
var serializers = defaultHandlers.serializers;
var parsers = defaultHandlers.parsers;
function firstIsString(x) {
  if (Array.isArray(x))
    return firstIsString(x[0]);
  return typeof x === "string" ? 1009 : 0;
}
var mergeUserTypes = function(types2) {
  const user = typeHandlers(types2 || {});
  return {
    serializers: Object.assign({}, serializers, user.serializers),
    parsers: Object.assign({}, parsers, user.parsers)
  };
};
function typeHandlers(types2) {
  return Object.keys(types2).reduce((acc, k) => {
    types2[k].from && [].concat(types2[k].from).forEach((x) => acc.parsers[x] = types2[k].parse);
    if (types2[k].serialize) {
      acc.serializers[types2[k].to] = types2[k].serialize;
      types2[k].from && [].concat(types2[k].from).forEach((x) => acc.serializers[x] = types2[k].serialize);
    }
    return acc;
  }, { parsers: {}, serializers: {} });
}
function escapeIdentifiers(xs, { transform: { column } }) {
  return xs.map((x) => escapeIdentifier(column.to ? column.to(x) : x)).join(",");
}
var escapeIdentifier = function escape(str) {
  return '"' + str.replace(/"/g, '""').replace(/\./g, '"."') + '"';
};
var inferType = function inferType2(x) {
  return x instanceof Parameter ? x.type : x instanceof Date ? 1184 : x instanceof Uint8Array ? 17 : x === true || x === false ? 16 : typeof x === "bigint" ? 20 : Array.isArray(x) ? inferType2(x[0]) : 0;
};
var escapeBackslash = /\\/g;
var escapeQuote = /"/g;
function arrayEscape(x) {
  return x.replace(escapeBackslash, "\\\\").replace(escapeQuote, '\\"');
}
var arraySerializer = function arraySerializer2(xs, serializer, options, typarray) {
  if (Array.isArray(xs) === false)
    return xs;
  if (!xs.length)
    return "{}";
  const first = xs[0];
  const delimiter = typarray === 1020 ? ";" : ",";
  if (Array.isArray(first) && !first.type)
    return "{" + xs.map((x) => arraySerializer2(x, serializer, options, typarray)).join(delimiter) + "}";
  return "{" + xs.map((x) => {
    if (x === void 0) {
      x = options.transform.undefined;
      if (x === void 0)
        throw Errors.generic("UNDEFINED_VALUE", "Undefined values are not allowed");
    }
    return x === null ? "null" : '"' + arrayEscape(serializer ? serializer(x.type ? x.value : x) : "" + x) + '"';
  }).join(delimiter) + "}";
};
var arrayParserState = {
  i: 0,
  char: null,
  str: "",
  quoted: false,
  last: 0
};
var arrayParser = function arrayParser2(x, parser, typarray) {
  arrayParserState.i = arrayParserState.last = 0;
  return arrayParserLoop(arrayParserState, x, parser, typarray);
};
function arrayParserLoop(s, x, parser, typarray) {
  const xs = [];
  const delimiter = typarray === 1020 ? ";" : ",";
  for (; s.i < x.length; s.i++) {
    s.char = x[s.i];
    if (s.quoted) {
      if (s.char === "\\") {
        s.str += x[++s.i];
      } else if (s.char === '"') {
        xs.push(parser ? parser(s.str) : s.str);
        s.str = "";
        s.quoted = x[s.i + 1] === '"';
        s.last = s.i + 2;
      } else {
        s.str += s.char;
      }
    } else if (s.char === '"') {
      s.quoted = true;
    } else if (s.char === "{") {
      s.last = ++s.i;
      xs.push(arrayParserLoop(s, x, parser, typarray));
    } else if (s.char === "}") {
      s.quoted = false;
      s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
      break;
    } else if (s.char === delimiter && s.p !== "}" && s.p !== '"') {
      xs.push(parser ? parser(x.slice(s.last, s.i)) : x.slice(s.last, s.i));
      s.last = s.i + 1;
    }
    s.p = s.char;
  }
  s.last < s.i && xs.push(parser ? parser(x.slice(s.last, s.i + 1)) : x.slice(s.last, s.i + 1));
  return xs;
}
var toCamel = (x) => {
  let str = x[0];
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toPascal = (x) => {
  let str = x[0].toUpperCase();
  for (let i = 1; i < x.length; i++)
    str += x[i] === "_" ? x[++i].toUpperCase() : x[i];
  return str;
};
var toKebab = (x) => x.replace(/_/g, "-");
var fromCamel = (x) => x.replace(/([A-Z])/g, "_$1").toLowerCase();
var fromPascal = (x) => (x.slice(0, 1) + x.slice(1).replace(/([A-Z])/g, "_$1")).toLowerCase();
var fromKebab = (x) => x.replace(/-/g, "_");
function createJsonTransform(fn) {
  return function jsonTransform(x, column) {
    return typeof x === "object" && x !== null && (column.type === 114 || column.type === 3802) ? Array.isArray(x) ? x.map((x2) => jsonTransform(x2, column)) : Object.entries(x).reduce((acc, [k, v]) => Object.assign(acc, { [fn(k)]: jsonTransform(v, column) }), {}) : x;
  };
}
toCamel.column = { from: toCamel };
toCamel.value = { from: createJsonTransform(toCamel) };
fromCamel.column = { to: fromCamel };
var camel = { ...toCamel };
camel.column.to = fromCamel;
toPascal.column = { from: toPascal };
toPascal.value = { from: createJsonTransform(toPascal) };
fromPascal.column = { to: fromPascal };
var pascal = { ...toPascal };
pascal.column.to = fromPascal;
toKebab.column = { from: toKebab };
toKebab.value = { from: createJsonTransform(toKebab) };
fromKebab.column = { to: fromKebab };
var kebab = { ...toKebab };
kebab.column.to = fromKebab;

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/connection.js
import net from "net";
import tls from "tls";
import crypto from "crypto";
import Stream from "stream";
import { performance } from "perf_hooks";

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/result.js
var Result = class extends Array {
  constructor() {
    super();
    Object.defineProperties(this, {
      count: { value: null, writable: true },
      state: { value: null, writable: true },
      command: { value: null, writable: true },
      columns: { value: null, writable: true },
      statement: { value: null, writable: true }
    });
  }
  static get [Symbol.species]() {
    return Array;
  }
};

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/queue.js
var queue_default = Queue;
function Queue(initial = []) {
  let xs = initial.slice();
  let index2 = 0;
  return {
    get length() {
      return xs.length - index2;
    },
    remove: (x) => {
      const index3 = xs.indexOf(x);
      return index3 === -1 ? null : (xs.splice(index3, 1), x);
    },
    push: (x) => (xs.push(x), x),
    shift: () => {
      const out = xs[index2++];
      if (index2 === xs.length) {
        index2 = 0;
        xs = [];
      } else {
        xs[index2 - 1] = void 0;
      }
      return out;
    }
  };
}

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/bytes.js
var size = 256;
var buffer = Buffer.allocUnsafe(size);
var messages = "BCcDdEFfHPpQSX".split("").reduce((acc, x) => {
  const v = x.charCodeAt(0);
  acc[x] = () => {
    buffer[0] = v;
    b.i = 5;
    return b;
  };
  return acc;
}, {});
var b = Object.assign(reset, messages, {
  N: String.fromCharCode(0),
  i: 0,
  inc(x) {
    b.i += x;
    return b;
  },
  str(x) {
    const length = Buffer.byteLength(x);
    fit(length);
    b.i += buffer.write(x, b.i, length, "utf8");
    return b;
  },
  i16(x) {
    fit(2);
    buffer.writeUInt16BE(x, b.i);
    b.i += 2;
    return b;
  },
  i32(x, i) {
    if (i || i === 0) {
      buffer.writeUInt32BE(x, i);
      return b;
    }
    fit(4);
    buffer.writeUInt32BE(x, b.i);
    b.i += 4;
    return b;
  },
  z(x) {
    fit(x);
    buffer.fill(0, b.i, b.i + x);
    b.i += x;
    return b;
  },
  raw(x) {
    buffer = Buffer.concat([buffer.subarray(0, b.i), x]);
    b.i = buffer.length;
    return b;
  },
  end(at = 1) {
    buffer.writeUInt32BE(b.i - at, at);
    const out = buffer.subarray(0, b.i);
    b.i = 0;
    buffer = Buffer.allocUnsafe(size);
    return out;
  }
});
var bytes_default = b;
function fit(x) {
  if (buffer.length - b.i < x) {
    const prev = buffer, length = prev.length;
    buffer = Buffer.allocUnsafe(length + (length >> 1) + x);
    prev.copy(buffer);
  }
}
function reset() {
  b.i = 0;
  return b;
}

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/connection.js
var connection_default = Connection;
var uid = 1;
var Sync = bytes_default().S().end();
var Flush = bytes_default().H().end();
var SSLRequest = bytes_default().i32(8).i32(80877103).end(8);
var ExecuteUnnamed = Buffer.concat([bytes_default().E().str(bytes_default.N).i32(0).end(), Sync]);
var DescribeUnnamed = bytes_default().D().str("S").str(bytes_default.N).end();
var noop = () => {
};
var retryRoutines = /* @__PURE__ */ new Set([
  "FetchPreparedStatement",
  "RevalidateCachedQuery",
  "transformAssignedExpr"
]);
var errorFields = {
  83: "severity_local",
  // S
  86: "severity",
  // V
  67: "code",
  // C
  77: "message",
  // M
  68: "detail",
  // D
  72: "hint",
  // H
  80: "position",
  // P
  112: "internal_position",
  // p
  113: "internal_query",
  // q
  87: "where",
  // W
  115: "schema_name",
  // s
  116: "table_name",
  // t
  99: "column_name",
  // c
  100: "data type_name",
  // d
  110: "constraint_name",
  // n
  70: "file",
  // F
  76: "line",
  // L
  82: "routine"
  // R
};
function Connection(options, queues = {}, { onopen = noop, onend = noop, onclose = noop } = {}) {
  const {
    sslnegotiation,
    ssl,
    max,
    user,
    host,
    port,
    database,
    parsers: parsers2,
    transform,
    onnotice,
    onnotify,
    onparameter,
    max_pipeline,
    keep_alive,
    backoff: backoff2,
    target_session_attrs
  } = options;
  const sent = queue_default(), id = uid++, backend = { pid: null, secret: null }, idleTimer = timer(end, options.idle_timeout), lifeTimer = timer(end, options.max_lifetime), connectTimer = timer(connectTimedOut, options.connect_timeout);
  let socket = null, cancelMessage, errorResponse = null, result = new Result(), incoming = Buffer.alloc(0), needsTypes = options.fetch_types, backendParameters = {}, statements = {}, statementId = Math.random().toString(36).slice(2), statementCount = 1, closedTime = 0, remaining = 0, hostIndex = 0, retries = 0, length = 0, delay = 0, rows = 0, serverSignature = null, nextWriteTimer = null, terminated = false, incomings = null, results = null, initial = null, ending = null, stream = null, chunk = null, ended = null, nonce = null, query = null, final = null;
  const connection2 = {
    queue: queues.closed,
    idleTimer,
    connect(query2) {
      initial = query2;
      reconnect();
    },
    terminate,
    execute,
    cancel,
    end,
    count: 0,
    id
  };
  queues.closed && queues.closed.push(connection2);
  return connection2;
  async function createSocket() {
    let x;
    try {
      x = options.socket ? await Promise.resolve(options.socket(options)) : new net.Socket();
    } catch (e) {
      error(e);
      return;
    }
    x.on("error", error);
    x.on("close", closed);
    x.on("drain", drain);
    return x;
  }
  async function cancel({ pid, secret }, resolve, reject) {
    try {
      cancelMessage = bytes_default().i32(16).i32(80877102).i32(pid).i32(secret).end(16);
      await connect();
      socket.once("error", reject);
      socket.once("close", resolve);
    } catch (error2) {
      reject(error2);
    }
  }
  function execute(q) {
    if (terminated)
      return queryError(q, Errors.connection("CONNECTION_DESTROYED", options));
    if (stream)
      return queryError(q, Errors.generic("COPY_IN_PROGRESS", "You cannot execute queries during copy"));
    if (q.cancelled)
      return;
    try {
      q.state = backend;
      query ? sent.push(q) : (query = q, query.active = true);
      build(q);
      return write(toBuffer(q)) && !q.describeFirst && !q.cursorFn && sent.length < max_pipeline && (!q.options.onexecute || q.options.onexecute(connection2));
    } catch (error2) {
      sent.length === 0 && write(Sync);
      errored(error2);
      return true;
    }
  }
  function toBuffer(q) {
    if (q.parameters.length >= 65534)
      throw Errors.generic("MAX_PARAMETERS_EXCEEDED", "Max number of parameters (65534) exceeded");
    return q.options.simple ? bytes_default().Q().str(q.statement.string + bytes_default.N).end() : q.describeFirst ? Buffer.concat([describe(q), Flush]) : q.prepare ? q.prepared ? prepared(q) : Buffer.concat([describe(q), prepared(q)]) : unnamed(q);
  }
  function describe(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types, q.statement.name),
      Describe("S", q.statement.name)
    ]);
  }
  function prepared(q) {
    return Buffer.concat([
      Bind(q.parameters, q.statement.types, q.statement.name, q.cursorName),
      q.cursorFn ? Execute("", q.cursorRows) : ExecuteUnnamed
    ]);
  }
  function unnamed(q) {
    return Buffer.concat([
      Parse(q.statement.string, q.parameters, q.statement.types),
      DescribeUnnamed,
      prepared(q)
    ]);
  }
  function build(q) {
    const parameters = [], types2 = [];
    const string = stringify(q, q.strings[0], q.args[0], parameters, types2, options);
    !q.tagged && q.args.forEach((x) => handleValue(x, parameters, types2, options));
    q.prepare = options.prepare && ("prepare" in q.options ? q.options.prepare : true);
    q.string = string;
    q.signature = q.prepare && types2 + string;
    q.onlyDescribe && delete statements[q.signature];
    q.parameters = q.parameters || parameters;
    q.prepared = q.prepare && q.signature in statements;
    q.describeFirst = q.onlyDescribe || parameters.length && !q.prepared;
    q.statement = q.prepared ? statements[q.signature] : { string, types: types2, name: q.prepare ? statementId + statementCount++ : "" };
    typeof options.debug === "function" && options.debug(id, string, parameters, types2);
  }
  function write(x, fn) {
    chunk = chunk ? Buffer.concat([chunk, x]) : Buffer.from(x);
    if (fn || chunk.length >= 1024)
      return nextWrite(fn);
    nextWriteTimer === null && (nextWriteTimer = setImmediate(nextWrite));
    return true;
  }
  function nextWrite(fn) {
    const x = socket.write(chunk, fn);
    nextWriteTimer !== null && clearImmediate(nextWriteTimer);
    chunk = nextWriteTimer = null;
    return x;
  }
  function connectTimedOut() {
    errored(Errors.connection("CONNECT_TIMEOUT", options, socket));
    socket.destroy();
  }
  async function secure() {
    if (sslnegotiation !== "direct") {
      write(SSLRequest);
      const canSSL = await new Promise((r) => socket.once("data", (x) => r(x[0] === 83)));
      if (!canSSL && ssl === "prefer")
        return connected();
    }
    const options2 = {
      socket,
      servername: net.isIP(socket.host) ? void 0 : socket.host
    };
    if (sslnegotiation === "direct")
      options2.ALPNProtocols = ["postgresql"];
    if (ssl === "require" || ssl === "allow" || ssl === "prefer")
      options2.rejectUnauthorized = false;
    else if (typeof ssl === "object")
      Object.assign(options2, ssl);
    socket.removeAllListeners();
    socket = tls.connect(options2);
    socket.on("secureConnect", connected);
    socket.on("error", error);
    socket.on("close", closed);
    socket.on("drain", drain);
  }
  function drain() {
    !query && onopen(connection2);
  }
  function data(x) {
    if (incomings) {
      incomings.push(x);
      remaining -= x.length;
      if (remaining > 0)
        return;
    }
    incoming = incomings ? Buffer.concat(incomings, length - remaining) : incoming.length === 0 ? x : Buffer.concat([incoming, x], incoming.length + x.length);
    while (incoming.length > 4) {
      length = incoming.readUInt32BE(1);
      if (length >= incoming.length) {
        remaining = length - incoming.length;
        incomings = [incoming];
        break;
      }
      try {
        handle(incoming.subarray(0, length + 1));
      } catch (e) {
        query && (query.cursorFn || query.describeFirst) && write(Sync);
        errored(e);
      }
      incoming = incoming.subarray(length + 1);
      remaining = 0;
      incomings = null;
    }
  }
  async function connect() {
    terminated = false;
    backendParameters = {};
    socket || (socket = await createSocket());
    if (!socket)
      return;
    connectTimer.start();
    if (options.socket)
      return ssl ? secure() : connected();
    socket.on("connect", ssl ? secure : connected);
    if (options.path)
      return socket.connect(options.path);
    socket.ssl = ssl;
    socket.connect(port[hostIndex], host[hostIndex]);
    socket.host = host[hostIndex];
    socket.port = port[hostIndex];
    hostIndex = (hostIndex + 1) % port.length;
  }
  function reconnect() {
    setTimeout(connect, closedTime ? Math.max(0, closedTime + delay - performance.now()) : 0);
  }
  function connected() {
    try {
      statements = {};
      needsTypes = options.fetch_types;
      statementId = Math.random().toString(36).slice(2);
      statementCount = 1;
      lifeTimer.start();
      socket.on("data", data);
      keep_alive && socket.setKeepAlive && socket.setKeepAlive(true, 1e3 * keep_alive);
      const s = StartupMessage();
      write(s);
    } catch (err) {
      error(err);
    }
  }
  function error(err) {
    if (connection2.queue === queues.connecting && options.host[retries + 1])
      return;
    errored(err);
    while (sent.length)
      queryError(sent.shift(), err);
  }
  function errored(err) {
    stream && (stream.destroy(err), stream = null);
    query && queryError(query, err);
    initial && (queryError(initial, err), initial = null);
  }
  function queryError(query2, err) {
    if (query2.reserve)
      return query2.reject(err);
    if (!err || typeof err !== "object")
      err = new Error(err);
    "query" in err || "parameters" in err || Object.defineProperties(err, {
      stack: { value: err.stack + query2.origin.replace(/.*\n/, "\n"), enumerable: options.debug },
      query: { value: query2.string, enumerable: options.debug },
      parameters: { value: query2.parameters, enumerable: options.debug },
      args: { value: query2.args, enumerable: options.debug },
      types: { value: query2.statement && query2.statement.types, enumerable: options.debug }
    });
    query2.reject(err);
  }
  function end() {
    return ending || (!connection2.reserved && onend(connection2), !connection2.reserved && !initial && !query && sent.length === 0 ? (terminate(), new Promise((r) => socket && socket.readyState !== "closed" ? socket.once("close", r) : r())) : ending = new Promise((r) => ended = r));
  }
  function terminate() {
    terminated = true;
    if (stream || query || initial || sent.length)
      error(Errors.connection("CONNECTION_DESTROYED", options));
    clearImmediate(nextWriteTimer);
    if (socket) {
      socket.removeListener("data", data);
      socket.removeListener("connect", connected);
      socket.readyState === "open" && socket.end(bytes_default().X().end());
    }
    ended && (ended(), ending = ended = null);
  }
  async function closed(hadError) {
    incoming = Buffer.alloc(0);
    remaining = 0;
    incomings = null;
    clearImmediate(nextWriteTimer);
    socket.removeListener("data", data);
    socket.removeListener("connect", connected);
    idleTimer.cancel();
    lifeTimer.cancel();
    connectTimer.cancel();
    socket.removeAllListeners();
    socket = null;
    if (initial)
      return reconnect();
    !hadError && (query || sent.length) && error(Errors.connection("CONNECTION_CLOSED", options, socket));
    closedTime = performance.now();
    hadError && options.shared.retries++;
    delay = (typeof backoff2 === "function" ? backoff2(options.shared.retries) : backoff2) * 1e3;
    onclose(connection2, Errors.connection("CONNECTION_CLOSED", options, socket));
  }
  function handle(xs, x = xs[0]) {
    (x === 68 ? DataRow : (
      // D
      x === 100 ? CopyData : (
        // d
        x === 65 ? NotificationResponse : (
          // A
          x === 83 ? ParameterStatus : (
            // S
            x === 90 ? ReadyForQuery : (
              // Z
              x === 67 ? CommandComplete : (
                // C
                x === 50 ? BindComplete : (
                  // 2
                  x === 49 ? ParseComplete : (
                    // 1
                    x === 116 ? ParameterDescription : (
                      // t
                      x === 84 ? RowDescription : (
                        // T
                        x === 82 ? Authentication : (
                          // R
                          x === 110 ? NoData : (
                            // n
                            x === 75 ? BackendKeyData : (
                              // K
                              x === 69 ? ErrorResponse : (
                                // E
                                x === 115 ? PortalSuspended : (
                                  // s
                                  x === 51 ? CloseComplete : (
                                    // 3
                                    x === 71 ? CopyInResponse : (
                                      // G
                                      x === 78 ? NoticeResponse : (
                                        // N
                                        x === 72 ? CopyOutResponse : (
                                          // H
                                          x === 99 ? CopyDone : (
                                            // c
                                            x === 73 ? EmptyQueryResponse : (
                                              // I
                                              x === 86 ? FunctionCallResponse : (
                                                // V
                                                x === 118 ? NegotiateProtocolVersion : (
                                                  // v
                                                  x === 87 ? CopyBothResponse : (
                                                    // W
                                                    /* c8 ignore next */
                                                    UnknownMessage
                                                  )
                                                )
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ))(xs);
  }
  function DataRow(x) {
    let index2 = 7;
    let length2;
    let column;
    let value;
    const row = query.isRaw ? new Array(query.statement.columns.length) : {};
    for (let i = 0; i < query.statement.columns.length; i++) {
      column = query.statement.columns[i];
      length2 = x.readInt32BE(index2);
      index2 += 4;
      value = length2 === -1 ? null : query.isRaw === true ? x.subarray(index2, index2 += length2) : column.parser === void 0 ? x.toString("utf8", index2, index2 += length2) : column.parser.array === true ? column.parser(x.toString("utf8", index2 + 1, index2 += length2)) : column.parser(x.toString("utf8", index2, index2 += length2));
      query.isRaw ? row[i] = query.isRaw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
    }
    query.forEachFn ? query.forEachFn(transform.row.from ? transform.row.from(row) : row, result) : result[rows++] = transform.row.from ? transform.row.from(row) : row;
  }
  function ParameterStatus(x) {
    const [k, v] = x.toString("utf8", 5, x.length - 1).split(bytes_default.N);
    backendParameters[k] = v;
    if (options.parameters[k] !== v) {
      options.parameters[k] = v;
      onparameter && onparameter(k, v);
    }
  }
  function ReadyForQuery(x) {
    if (query) {
      if (errorResponse) {
        query.retried ? errored(query.retried) : query.prepared && retryRoutines.has(errorResponse.routine) ? retry(query, errorResponse) : errored(errorResponse);
      } else {
        query.resolve(results || result);
      }
    } else if (errorResponse) {
      errored(errorResponse);
    }
    query = results = errorResponse = null;
    result = new Result();
    connectTimer.cancel();
    if (initial) {
      if (target_session_attrs) {
        if (!backendParameters.in_hot_standby || !backendParameters.default_transaction_read_only)
          return fetchState();
        else if (tryNext(target_session_attrs, backendParameters))
          return terminate();
      }
      if (needsTypes) {
        initial.reserve && (initial = null);
        return fetchArrayTypes();
      }
      initial && !initial.reserve && execute(initial);
      options.shared.retries = retries = 0;
      initial = null;
      return;
    }
    while (sent.length && (query = sent.shift()) && (query.active = true, query.cancelled))
      Connection(options).cancel(query.state, query.cancelled.resolve, query.cancelled.reject);
    if (query)
      return;
    connection2.reserved ? !connection2.reserved.release && x[5] === 73 ? ending ? terminate() : (connection2.reserved = null, onopen(connection2)) : connection2.reserved() : ending ? terminate() : onopen(connection2);
  }
  function CommandComplete(x) {
    rows = 0;
    for (let i = x.length - 1; i > 0; i--) {
      if (x[i] === 32 && x[i + 1] < 58 && result.count === null)
        result.count = +x.toString("utf8", i + 1, x.length - 1);
      if (x[i - 1] >= 65) {
        result.command = x.toString("utf8", 5, i);
        result.state = backend;
        break;
      }
    }
    final && (final(), final = null);
    if (result.command === "BEGIN" && max !== 1 && !connection2.reserved)
      return errored(Errors.generic("UNSAFE_TRANSACTION", "Only use sql.begin, sql.reserved or max: 1"));
    if (query.options.simple)
      return BindComplete();
    if (query.cursorFn) {
      result.count && query.cursorFn(result);
      write(Sync);
    }
  }
  function ParseComplete() {
    query.parsing = false;
  }
  function BindComplete() {
    !result.statement && (result.statement = query.statement);
    result.columns = query.statement.columns;
  }
  function ParameterDescription(x) {
    const length2 = x.readUInt16BE(5);
    for (let i = 0; i < length2; ++i)
      !query.statement.types[i] && (query.statement.types[i] = x.readUInt32BE(7 + i * 4));
    query.prepare && (statements[query.signature] = query.statement);
    query.describeFirst && !query.onlyDescribe && (write(prepared(query)), query.describeFirst = false);
  }
  function RowDescription(x) {
    if (result.command) {
      results = results || [result];
      results.push(result = new Result());
      result.count = null;
      query.statement.columns = null;
    }
    const length2 = x.readUInt16BE(5);
    let index2 = 7;
    let start;
    query.statement.columns = Array(length2);
    for (let i = 0; i < length2; ++i) {
      start = index2;
      while (x[index2++] !== 0) ;
      const table = x.readUInt32BE(index2);
      const number = x.readUInt16BE(index2 + 4);
      const type = x.readUInt32BE(index2 + 6);
      query.statement.columns[i] = {
        name: transform.column.from ? transform.column.from(x.toString("utf8", start, index2 - 1)) : x.toString("utf8", start, index2 - 1),
        parser: parsers2[type],
        table,
        number,
        type
      };
      index2 += 18;
    }
    result.statement = query.statement;
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  async function Authentication(x, type = x.readUInt32BE(5)) {
    (type === 3 ? AuthenticationCleartextPassword : type === 5 ? AuthenticationMD5Password : type === 10 ? SASL : type === 11 ? SASLContinue : type === 12 ? SASLFinal : type !== 0 ? UnknownAuth : noop)(x, type);
  }
  async function AuthenticationCleartextPassword() {
    const payload = await Pass();
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function AuthenticationMD5Password(x) {
    const payload = "md5" + await md5(
      Buffer.concat([
        Buffer.from(await md5(await Pass() + user)),
        x.subarray(9)
      ])
    );
    write(
      bytes_default().p().str(payload).z(1).end()
    );
  }
  async function SASL() {
    nonce = (await crypto.randomBytes(18)).toString("base64");
    bytes_default().p().str("SCRAM-SHA-256" + bytes_default.N);
    const i = bytes_default.i;
    write(bytes_default.inc(4).str("n,,n=*,r=" + nonce).i32(bytes_default.i - i - 4, i).end());
  }
  async function SASLContinue(x) {
    const res = x.toString("utf8", 9).split(",").reduce((acc, x2) => (acc[x2[0]] = x2.slice(2), acc), {});
    const saltedPassword = await crypto.pbkdf2Sync(
      await Pass(),
      Buffer.from(res.s, "base64"),
      parseInt(res.i),
      32,
      "sha256"
    );
    const clientKey = await hmac(saltedPassword, "Client Key");
    const auth = "n=*,r=" + nonce + ",r=" + res.r + ",s=" + res.s + ",i=" + res.i + ",c=biws,r=" + res.r;
    serverSignature = (await hmac(await hmac(saltedPassword, "Server Key"), auth)).toString("base64");
    const payload = "c=biws,r=" + res.r + ",p=" + xor(
      clientKey,
      Buffer.from(await hmac(await sha256(clientKey), auth))
    ).toString("base64");
    write(
      bytes_default().p().str(payload).end()
    );
  }
  function SASLFinal(x) {
    if (x.toString("utf8", 9).split(bytes_default.N, 1)[0].slice(2) === serverSignature)
      return;
    errored(Errors.generic("SASL_SIGNATURE_MISMATCH", "The server did not return the correct signature"));
    socket.destroy();
  }
  function Pass() {
    return Promise.resolve(
      typeof options.pass === "function" ? options.pass() : options.pass
    );
  }
  function NoData() {
    result.statement = query.statement;
    result.statement.columns = [];
    if (query.onlyDescribe)
      return query.resolve(query.statement), write(Sync);
  }
  function BackendKeyData(x) {
    backend.pid = x.readUInt32BE(5);
    backend.secret = x.readUInt32BE(9);
  }
  async function fetchArrayTypes() {
    needsTypes = false;
    const types2 = await new Query([`
      select b.oid, b.typarray
      from pg_catalog.pg_type a
      left join pg_catalog.pg_type b on b.oid = a.typelem
      where a.typcategory = 'A'
      group by b.oid, b.typarray
      order by b.oid
    `], [], execute);
    types2.forEach(({ oid, typarray }) => addArrayType(oid, typarray));
  }
  function addArrayType(oid, typarray) {
    if (!!options.parsers[typarray] && !!options.serializers[typarray]) return;
    const parser = options.parsers[oid];
    options.shared.typeArrayMap[oid] = typarray;
    options.parsers[typarray] = (xs) => arrayParser(xs, parser, typarray);
    options.parsers[typarray].array = true;
    options.serializers[typarray] = (xs) => arraySerializer(xs, options.serializers[oid], options, typarray);
  }
  function tryNext(x, xs) {
    return x === "read-write" && xs.default_transaction_read_only === "on" || x === "read-only" && xs.default_transaction_read_only === "off" || x === "primary" && xs.in_hot_standby === "on" || x === "standby" && xs.in_hot_standby === "off" || x === "prefer-standby" && xs.in_hot_standby === "off" && options.host[retries];
  }
  function fetchState() {
    const query2 = new Query([`
      show transaction_read_only;
      select pg_catalog.pg_is_in_recovery()
    `], [], execute, null, { simple: true });
    query2.resolve = ([[a], [b2]]) => {
      backendParameters.default_transaction_read_only = a.transaction_read_only;
      backendParameters.in_hot_standby = b2.pg_is_in_recovery ? "on" : "off";
    };
    query2.execute();
  }
  function ErrorResponse(x) {
    if (query) {
      (query.cursorFn || query.describeFirst) && write(Sync);
      errorResponse = Errors.postgres(parseError(x));
    } else {
      errored(Errors.postgres(parseError(x)));
    }
  }
  function retry(q, error2) {
    delete statements[q.signature];
    q.retried = error2;
    execute(q);
  }
  function NotificationResponse(x) {
    if (!onnotify)
      return;
    let index2 = 9;
    while (x[index2++] !== 0) ;
    onnotify(
      x.toString("utf8", 9, index2 - 1),
      x.toString("utf8", index2, x.length - 1)
    );
  }
  async function PortalSuspended() {
    try {
      const x = await Promise.resolve(query.cursorFn(result));
      rows = 0;
      x === CLOSE ? write(Close(query.portal)) : (result = new Result(), write(Execute("", query.cursorRows)));
    } catch (err) {
      write(Sync);
      query.reject(err);
    }
  }
  function CloseComplete() {
    result.count && query.cursorFn(result);
    query.resolve(result);
  }
  function CopyInResponse() {
    stream = new Stream.Writable({
      autoDestroy: true,
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
        stream = null;
      }
    });
    query.resolve(stream);
  }
  function CopyOutResponse() {
    stream = new Stream.Readable({
      read() {
        socket.resume();
      }
    });
    query.resolve(stream);
  }
  function CopyBothResponse() {
    stream = new Stream.Duplex({
      autoDestroy: true,
      read() {
        socket.resume();
      },
      /* c8 ignore next 11 */
      write(chunk2, encoding, callback) {
        socket.write(bytes_default().d().raw(chunk2).end(), callback);
      },
      destroy(error2, callback) {
        callback(error2);
        socket.write(bytes_default().f().str(error2 + bytes_default.N).end());
        stream = null;
      },
      final(callback) {
        socket.write(bytes_default().c().end());
        final = callback;
      }
    });
    query.resolve(stream);
  }
  function CopyData(x) {
    stream && (stream.push(x.subarray(5)) || socket.pause());
  }
  function CopyDone() {
    stream && stream.push(null);
    stream = null;
  }
  function NoticeResponse(x) {
    onnotice ? onnotice(parseError(x)) : console.log(parseError(x));
  }
  function EmptyQueryResponse() {
  }
  function FunctionCallResponse() {
    errored(Errors.notSupported("FunctionCallResponse"));
  }
  function NegotiateProtocolVersion() {
    errored(Errors.notSupported("NegotiateProtocolVersion"));
  }
  function UnknownMessage(x) {
    console.error("Postgres.js : Unknown Message:", x[0]);
  }
  function UnknownAuth(x, type) {
    console.error("Postgres.js : Unknown Auth:", type);
  }
  function Bind(parameters, types2, statement = "", portal = "") {
    let prev, type;
    bytes_default().B().str(portal + bytes_default.N).str(statement + bytes_default.N).i16(0).i16(parameters.length);
    parameters.forEach((x, i) => {
      if (x === null)
        return bytes_default.i32(4294967295);
      type = types2[i];
      parameters[i] = x = type in options.serializers ? options.serializers[type](x) : "" + x;
      prev = bytes_default.i;
      bytes_default.inc(4).str(x).i32(bytes_default.i - prev - 4, prev);
    });
    bytes_default.i16(0);
    return bytes_default.end();
  }
  function Parse(str, parameters, types2, name = "") {
    bytes_default().P().str(name + bytes_default.N).str(str + bytes_default.N).i16(parameters.length);
    parameters.forEach((x, i) => bytes_default.i32(types2[i] || 0));
    return bytes_default.end();
  }
  function Describe(x, name = "") {
    return bytes_default().D().str(x).str(name + bytes_default.N).end();
  }
  function Execute(portal = "", rows2 = 0) {
    return Buffer.concat([
      bytes_default().E().str(portal + bytes_default.N).i32(rows2).end(),
      Flush
    ]);
  }
  function Close(portal = "") {
    return Buffer.concat([
      bytes_default().C().str("P").str(portal + bytes_default.N).end(),
      bytes_default().S().end()
    ]);
  }
  function StartupMessage() {
    return cancelMessage || bytes_default().inc(4).i16(3).z(2).str(
      Object.entries(Object.assign(
        {
          user,
          database,
          client_encoding: "UTF8"
        },
        options.connection
      )).filter(([, v]) => v).map(([k, v]) => k + bytes_default.N + v).join(bytes_default.N)
    ).z(2).end(0);
  }
}
function parseError(x) {
  const error = {};
  let start = 5;
  for (let i = 5; i < x.length - 1; i++) {
    if (x[i] === 0) {
      error[errorFields[x[start]]] = x.toString("utf8", start + 1, i);
      start = i + 1;
    }
  }
  return error;
}
function md5(x) {
  return crypto.createHash("md5").update(x).digest("hex");
}
function hmac(key, x) {
  return crypto.createHmac("sha256", key).update(x).digest();
}
function sha256(x) {
  return crypto.createHash("sha256").update(x).digest();
}
function xor(a, b2) {
  const length = Math.max(a.length, b2.length);
  const buffer2 = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i++)
    buffer2[i] = a[i] ^ b2[i];
  return buffer2;
}
function timer(fn, seconds) {
  seconds = typeof seconds === "function" ? seconds() : seconds;
  if (!seconds)
    return { cancel: noop, start: noop };
  let timer2;
  return {
    cancel() {
      timer2 && (clearTimeout(timer2), timer2 = null);
    },
    start() {
      timer2 && clearTimeout(timer2);
      timer2 = setTimeout(done, seconds * 1e3, arguments);
    }
  };
  function done(args) {
    fn.apply(null, args);
    timer2 = null;
  }
}

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/subscribe.js
var noop2 = () => {
};
function Subscribe(postgres2, options) {
  const subscribers = /* @__PURE__ */ new Map(), slot = "postgresjs_" + Math.random().toString(36).slice(2), state = {};
  let connection2, stream, ended = false;
  const sql3 = subscribe.sql = postgres2({
    ...options,
    transform: { column: {}, value: {}, row: {} },
    max: 1,
    fetch_types: false,
    idle_timeout: null,
    max_lifetime: null,
    connection: {
      ...options.connection,
      replication: "database"
    },
    onclose: async function() {
      if (ended)
        return;
      stream = null;
      state.pid = state.secret = void 0;
      connected(await init(sql3, slot, options.publications));
      subscribers.forEach((event) => event.forEach(({ onsubscribe }) => onsubscribe()));
    },
    no_subscribe: true
  });
  const end = sql3.end, close = sql3.close;
  sql3.end = async () => {
    ended = true;
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return end();
  };
  sql3.close = async () => {
    stream && await new Promise((r) => (stream.once("close", r), stream.end()));
    return close();
  };
  return subscribe;
  async function subscribe(event, fn, onsubscribe = noop2, onerror = noop2) {
    event = parseEvent(event);
    if (!connection2)
      connection2 = init(sql3, slot, options.publications);
    const subscriber = { fn, onsubscribe };
    const fns = subscribers.has(event) ? subscribers.get(event).add(subscriber) : subscribers.set(event, /* @__PURE__ */ new Set([subscriber])).get(event);
    const unsubscribe = () => {
      fns.delete(subscriber);
      fns.size === 0 && subscribers.delete(event);
    };
    return connection2.then((x) => {
      connected(x);
      onsubscribe();
      stream && stream.on("error", onerror);
      return { unsubscribe, state, sql: sql3 };
    });
  }
  function connected(x) {
    stream = x.stream;
    state.pid = x.state.pid;
    state.secret = x.state.secret;
  }
  async function init(sql4, slot2, publications) {
    if (!publications)
      throw new Error("Missing publication names");
    const xs = await sql4.unsafe(
      `CREATE_REPLICATION_SLOT ${slot2} TEMPORARY LOGICAL pgoutput NOEXPORT_SNAPSHOT`
    );
    const [x] = xs;
    const stream2 = await sql4.unsafe(
      `START_REPLICATION SLOT ${slot2} LOGICAL ${x.consistent_point} (proto_version '1', publication_names '${publications}')`
    ).writable();
    const state2 = {
      lsn: Buffer.concat(x.consistent_point.split("/").map((x2) => Buffer.from(("00000000" + x2).slice(-8), "hex")))
    };
    stream2.on("data", data);
    stream2.on("error", error);
    stream2.on("close", sql4.close);
    return { stream: stream2, state: xs.state };
    function error(e) {
      console.error("Unexpected error during logical streaming - reconnecting", e);
    }
    function data(x2) {
      if (x2[0] === 119) {
        parse(x2.subarray(25), state2, sql4.options.parsers, handle, options.transform);
      } else if (x2[0] === 107 && x2[17]) {
        state2.lsn = x2.subarray(1, 9);
        pong();
      }
    }
    function handle(a, b2) {
      const path2 = b2.relation.schema + "." + b2.relation.table;
      call("*", a, b2);
      call("*:" + path2, a, b2);
      b2.relation.keys.length && call("*:" + path2 + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
      call(b2.command, a, b2);
      call(b2.command + ":" + path2, a, b2);
      b2.relation.keys.length && call(b2.command + ":" + path2 + "=" + b2.relation.keys.map((x2) => a[x2.name]), a, b2);
    }
    function pong() {
      const x2 = Buffer.alloc(34);
      x2[0] = "r".charCodeAt(0);
      x2.fill(state2.lsn, 1);
      x2.writeBigInt64BE(BigInt(Date.now() - Date.UTC(2e3, 0, 1)) * BigInt(1e3), 25);
      stream2.write(x2);
    }
  }
  function call(x, a, b2) {
    subscribers.has(x) && subscribers.get(x).forEach(({ fn }) => fn(a, b2, x));
  }
}
function Time(x) {
  return new Date(Date.UTC(2e3, 0, 1) + Number(x / BigInt(1e3)));
}
function parse(x, state, parsers2, handle, transform) {
  const char = (acc, [k, v]) => (acc[k.charCodeAt(0)] = v, acc);
  Object.entries({
    R: (x2) => {
      let i = 1;
      const r = state[x2.readUInt32BE(i)] = {
        schema: x2.toString("utf8", i += 4, i = x2.indexOf(0, i)) || "pg_catalog",
        table: x2.toString("utf8", i + 1, i = x2.indexOf(0, i + 1)),
        columns: Array(x2.readUInt16BE(i += 2)),
        keys: []
      };
      i += 2;
      let columnIndex = 0, column;
      while (i < x2.length) {
        column = r.columns[columnIndex++] = {
          key: x2[i++],
          name: transform.column.from ? transform.column.from(x2.toString("utf8", i, i = x2.indexOf(0, i))) : x2.toString("utf8", i, i = x2.indexOf(0, i)),
          type: x2.readUInt32BE(i += 1),
          parser: parsers2[x2.readUInt32BE(i)],
          atttypmod: x2.readUInt32BE(i += 4)
        };
        column.key && r.keys.push(column);
        i += 4;
      }
    },
    Y: () => {
    },
    // Type
    O: () => {
    },
    // Origin
    B: (x2) => {
      state.date = Time(x2.readBigInt64BE(9));
      state.lsn = x2.subarray(1, 9);
    },
    I: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      const { row } = tuples(x2, relation.columns, i += 7, transform);
      handle(row, {
        command: "insert",
        relation
      });
    },
    D: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      handle(
        key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform).row : null,
        {
          command: "delete",
          relation,
          key
        }
      );
    },
    U: (x2) => {
      let i = 1;
      const relation = state[x2.readUInt32BE(i)];
      i += 4;
      const key = x2[i] === 75;
      const xs = key || x2[i] === 79 ? tuples(x2, relation.columns, i += 3, transform) : null;
      xs && (i = xs.i);
      const { row } = tuples(x2, relation.columns, i + 3, transform);
      handle(row, {
        command: "update",
        relation,
        key,
        old: xs && xs.row
      });
    },
    T: () => {
    },
    // Truncate,
    C: () => {
    }
    // Commit
  }).reduce(char, {})[x[0]](x);
}
function tuples(x, columns, xi, transform) {
  let type, column, value;
  const row = transform.raw ? new Array(columns.length) : {};
  for (let i = 0; i < columns.length; i++) {
    type = x[xi++];
    column = columns[i];
    value = type === 110 ? null : type === 117 ? void 0 : column.parser === void 0 ? x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)) : column.parser.array === true ? column.parser(x.toString("utf8", xi + 5, xi += 4 + x.readUInt32BE(xi))) : column.parser(x.toString("utf8", xi + 4, xi += 4 + x.readUInt32BE(xi)));
    transform.raw ? row[i] = transform.raw === true ? value : transform.value.from ? transform.value.from(value, column) : value : row[column.name] = transform.value.from ? transform.value.from(value, column) : value;
  }
  return { i: xi, row: transform.row.from ? transform.row.from(row) : row };
}
function parseEvent(x) {
  const xs = x.match(/^(\*|insert|update|delete)?:?([^.]+?\.?[^=]+)?=?(.+)?/i) || [];
  if (!xs)
    throw new Error("Malformed subscribe pattern: " + x);
  const [, command, path2, key] = xs;
  return (command || "*") + (path2 ? ":" + (path2.indexOf(".") === -1 ? "public." + path2 : path2) : "") + (key ? "=" + key : "");
}

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/large.js
import Stream2 from "stream";
function largeObject(sql3, oid, mode = 131072 | 262144) {
  return new Promise(async (resolve, reject) => {
    await sql3.begin(async (sql4) => {
      let finish;
      !oid && ([{ oid }] = await sql4`select lo_creat(-1) as oid`);
      const [{ fd }] = await sql4`select lo_open(${oid}, ${mode}) as fd`;
      const lo = {
        writable,
        readable,
        close: () => sql4`select lo_close(${fd})`.then(finish),
        tell: () => sql4`select lo_tell64(${fd})`,
        read: (x) => sql4`select loread(${fd}, ${x}) as data`,
        write: (x) => sql4`select lowrite(${fd}, ${x})`,
        truncate: (x) => sql4`select lo_truncate64(${fd}, ${x})`,
        seek: (x, whence = 0) => sql4`select lo_lseek64(${fd}, ${x}, ${whence})`,
        size: () => sql4`
          select
            lo_lseek64(${fd}, location, 0) as position,
            seek.size
          from (
            select
              lo_lseek64($1, 0, 2) as size,
              tell.location
            from (select lo_tell64($1) as location) tell
          ) seek
        `
      };
      resolve(lo);
      return new Promise(async (r) => finish = r);
      async function readable({
        highWaterMark = 2048 * 8,
        start = 0,
        end = Infinity
      } = {}) {
        let max = end - start;
        start && await lo.seek(start);
        return new Stream2.Readable({
          highWaterMark,
          async read(size2) {
            const l = size2 > max ? size2 - max : size2;
            max -= size2;
            const [{ data }] = await lo.read(l);
            this.push(data);
            if (data.length < size2)
              this.push(null);
          }
        });
      }
      async function writable({
        highWaterMark = 2048 * 8,
        start = 0
      } = {}) {
        start && await lo.seek(start);
        return new Stream2.Writable({
          highWaterMark,
          write(chunk, encoding, callback) {
            lo.write(chunk).then(() => callback(), callback);
          }
        });
      }
    }).catch(reject);
  });
}

// ../../node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js
Object.assign(Postgres, {
  PostgresError,
  toPascal,
  pascal,
  toCamel,
  camel,
  toKebab,
  kebab,
  fromPascal,
  fromCamel,
  fromKebab,
  BigInt: {
    to: 20,
    from: [20],
    parse: (x) => BigInt(x),
    // eslint-disable-line
    serialize: (x) => x.toString()
  }
});
var src_default = Postgres;
function Postgres(a, b2) {
  const options = parseOptions(a, b2), subscribe = options.no_subscribe || Subscribe(Postgres, { ...options });
  let ending = false;
  const queries = queue_default(), connecting = queue_default(), reserved = queue_default(), closed = queue_default(), ended = queue_default(), open = queue_default(), busy = queue_default(), full = queue_default(), queues = { connecting, reserved, closed, ended, open, busy, full };
  const connections = [...Array(options.max)].map(() => connection_default(options, queues, { onopen, onend, onclose }));
  const sql3 = Sql(handler);
  Object.assign(sql3, {
    get parameters() {
      return options.parameters;
    },
    largeObject: largeObject.bind(null, sql3),
    subscribe,
    CLOSE,
    END: CLOSE,
    PostgresError,
    options,
    reserve,
    listen,
    begin,
    close,
    end
  });
  return sql3;
  function Sql(handler2) {
    handler2.debug = options.debug;
    Object.entries(options.types).reduce((acc, [name, type]) => {
      acc[name] = (x) => new Parameter(x, type.to);
      return acc;
    }, typed);
    Object.assign(sql4, {
      types: typed,
      typed,
      unsafe,
      notify,
      array,
      json,
      file
    });
    return sql4;
    function typed(value, type) {
      return new Parameter(value, type);
    }
    function sql4(strings, ...args) {
      const query = strings && Array.isArray(strings.raw) ? new Query(strings, args, handler2, cancel) : typeof strings === "string" && !args.length ? new Identifier(options.transform.column.to ? options.transform.column.to(strings) : strings) : new Builder(strings, args);
      return query;
    }
    function unsafe(string, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([string], args, handler2, cancel, {
        prepare: false,
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
    function file(path2, args = [], options2 = {}) {
      arguments.length === 2 && !Array.isArray(args) && (options2 = args, args = []);
      const query = new Query([], args, (query2) => {
        fs.readFile(path2, "utf8", (err, string) => {
          if (err)
            return query2.reject(err);
          query2.strings = [string];
          handler2(query2);
        });
      }, cancel, {
        ...options2,
        simple: "simple" in options2 ? options2.simple : args.length === 0
      });
      return query;
    }
  }
  async function listen(name, fn, onlisten) {
    const listener = { fn, onlisten };
    const sql4 = listen.sql || (listen.sql = Postgres({
      ...options,
      max: 1,
      idle_timeout: null,
      max_lifetime: null,
      fetch_types: false,
      onclose() {
        Object.entries(listen.channels).forEach(([name2, { listeners }]) => {
          delete listen.channels[name2];
          Promise.all(listeners.map((l) => listen(name2, l.fn, l.onlisten).catch(() => {
          })));
        });
      },
      onnotify(c, x) {
        c in listen.channels && listen.channels[c].listeners.forEach((l) => l.fn(x));
      }
    }));
    const channels = listen.channels || (listen.channels = {}), exists = name in channels;
    if (exists) {
      channels[name].listeners.push(listener);
      const result2 = await channels[name].result;
      listener.onlisten && listener.onlisten();
      return { state: result2.state, unlisten };
    }
    channels[name] = { result: sql4`listen ${sql4.unsafe('"' + name.replace(/"/g, '""') + '"')}`, listeners: [listener] };
    const result = await channels[name].result;
    listener.onlisten && listener.onlisten();
    return { state: result.state, unlisten };
    async function unlisten() {
      if (name in channels === false)
        return;
      channels[name].listeners = channels[name].listeners.filter((x) => x !== listener);
      if (channels[name].listeners.length)
        return;
      delete channels[name];
      return sql4`unlisten ${sql4.unsafe('"' + name.replace(/"/g, '""') + '"')}`;
    }
  }
  async function notify(channel, payload) {
    return await sql3`select pg_notify(${channel}, ${"" + payload})`;
  }
  async function reserve() {
    const queue = queue_default();
    const c = open.length ? open.shift() : await new Promise((resolve, reject) => {
      const query = { reserve: resolve, reject };
      queries.push(query);
      closed.length && connect(closed.shift(), query);
    });
    move(c, reserved);
    c.reserved = () => queue.length ? c.execute(queue.shift()) : move(c, reserved);
    c.reserved.release = true;
    const sql4 = Sql(handler2);
    sql4.release = () => {
      c.reserved = null;
      onopen(c);
    };
    return sql4;
    function handler2(q) {
      c.queue === full ? queue.push(q) : c.execute(q) || move(c, full);
    }
  }
  async function begin(options2, fn) {
    !fn && (fn = options2, options2 = "");
    const queries2 = queue_default();
    let savepoints = 0, connection2, prepare = null;
    try {
      await sql3.unsafe("begin " + options2.replace(/[^a-z ]/ig, ""), [], { onexecute }).execute();
      return await Promise.race([
        scope(connection2, fn),
        new Promise((_, reject) => connection2.onclose = reject)
      ]);
    } catch (error) {
      throw error;
    }
    async function scope(c, fn2, name) {
      const sql4 = Sql(handler2);
      sql4.savepoint = savepoint;
      sql4.prepare = (x) => prepare = x.replace(/[^a-z0-9$-_. ]/gi);
      let uncaughtError, result;
      name && await sql4`savepoint ${sql4(name)}`;
      try {
        result = await new Promise((resolve, reject) => {
          const x = fn2(sql4);
          Promise.resolve(Array.isArray(x) ? Promise.all(x) : x).then(resolve, reject);
        });
        if (uncaughtError)
          throw uncaughtError;
      } catch (e) {
        await (name ? sql4`rollback to ${sql4(name)}` : sql4`rollback`);
        throw e instanceof PostgresError && e.code === "25P02" && uncaughtError || e;
      }
      if (!name) {
        prepare ? await sql4`prepare transaction '${sql4.unsafe(prepare)}'` : await sql4`commit`;
      }
      return result;
      function savepoint(name2, fn3) {
        if (name2 && Array.isArray(name2.raw))
          return savepoint((sql5) => sql5.apply(sql5, arguments));
        arguments.length === 1 && (fn3 = name2, name2 = null);
        return scope(c, fn3, "s" + savepoints++ + (name2 ? "_" + name2 : ""));
      }
      function handler2(q) {
        q.catch((e) => uncaughtError || (uncaughtError = e));
        c.queue === full ? queries2.push(q) : c.execute(q) || move(c, full);
      }
    }
    function onexecute(c) {
      connection2 = c;
      move(c, reserved);
      c.reserved = () => queries2.length ? c.execute(queries2.shift()) : move(c, reserved);
    }
  }
  function move(c, queue) {
    c.queue.remove(c);
    queue.push(c);
    c.queue = queue;
    queue === open ? c.idleTimer.start() : c.idleTimer.cancel();
    return c;
  }
  function json(x) {
    return new Parameter(x, 3802);
  }
  function array(x, type) {
    if (!Array.isArray(x))
      return array(Array.from(arguments));
    return new Parameter(x, type || (x.length ? inferType(x) || 25 : 0), options.shared.typeArrayMap);
  }
  function handler(query) {
    if (ending)
      return query.reject(Errors.connection("CONNECTION_ENDED", options, options));
    if (open.length)
      return go(open.shift(), query);
    if (closed.length)
      return connect(closed.shift(), query);
    busy.length ? go(busy.shift(), query) : queries.push(query);
  }
  function go(c, query) {
    return c.execute(query) ? move(c, busy) : move(c, full);
  }
  function cancel(query) {
    return new Promise((resolve, reject) => {
      query.state ? query.active ? connection_default(options).cancel(query.state, resolve, reject) : query.cancelled = { resolve, reject } : (queries.remove(query), query.cancelled = true, query.reject(Errors.generic("57014", "canceling statement due to user request")), resolve());
    });
  }
  async function end({ timeout = null } = {}) {
    if (ending)
      return ending;
    await 1;
    let timer2;
    return ending = Promise.race([
      new Promise((r) => timeout !== null && (timer2 = setTimeout(destroy, timeout * 1e3, r))),
      Promise.all(connections.map((c) => c.end()).concat(
        listen.sql ? listen.sql.end({ timeout: 0 }) : [],
        subscribe.sql ? subscribe.sql.end({ timeout: 0 }) : []
      ))
    ]).then(() => clearTimeout(timer2));
  }
  async function close() {
    await Promise.all(connections.map((c) => c.end()));
  }
  async function destroy(resolve) {
    await Promise.all(connections.map((c) => c.terminate()));
    while (queries.length)
      queries.shift().reject(Errors.connection("CONNECTION_DESTROYED", options));
    resolve();
  }
  function connect(c, query) {
    move(c, connecting);
    c.connect(query);
    return c;
  }
  function onend(c) {
    move(c, ended);
  }
  function onopen(c) {
    if (queries.length === 0)
      return move(c, open);
    let max = Math.ceil(queries.length / (connecting.length + 1)), ready = true;
    while (ready && queries.length && max-- > 0) {
      const query = queries.shift();
      if (query.reserve)
        return query.reserve(c);
      ready = c.execute(query);
    }
    ready ? move(c, busy) : move(c, full);
  }
  function onclose(c, e) {
    move(c, closed);
    c.reserved = null;
    c.onclose && (c.onclose(e), c.onclose = null);
    options.onclose && options.onclose(c.id);
    queries.length && connect(c, queries.shift());
  }
}
function parseOptions(a, b2) {
  if (a && a.shared)
    return a;
  const env2 = process.env, o = (!a || typeof a === "string" ? b2 : a) || {}, { url, multihost } = parseUrl(a), query = [...url.searchParams].reduce((a2, [b3, c]) => (a2[b3] = c, a2), {}), host = o.hostname || o.host || multihost || url.hostname || env2.PGHOST || "localhost", port = o.port || url.port || env2.PGPORT || 5432, user = o.user || o.username || url.username || env2.PGUSERNAME || env2.PGUSER || osUsername();
  o.no_prepare && (o.prepare = false);
  query.sslmode && (query.ssl = query.sslmode, delete query.sslmode);
  "timeout" in o && (console.log("The timeout option is deprecated, use idle_timeout instead"), o.idle_timeout = o.timeout);
  query.sslrootcert === "system" && (query.ssl = "verify-full");
  const ints = ["idle_timeout", "connect_timeout", "max_lifetime", "max_pipeline", "backoff", "keep_alive"];
  const defaults = {
    max: globalThis.Cloudflare ? 3 : 10,
    ssl: false,
    sslnegotiation: null,
    idle_timeout: null,
    connect_timeout: 30,
    max_lifetime,
    max_pipeline: 100,
    backoff,
    keep_alive: 60,
    prepare: true,
    debug: false,
    fetch_types: true,
    publications: "alltables",
    target_session_attrs: null
  };
  return {
    host: Array.isArray(host) ? host : host.split(",").map((x) => x.split(":")[0]),
    port: Array.isArray(port) ? port : host.split(",").map((x) => parseInt(x.split(":")[1] || port)),
    path: o.path || host.indexOf("/") > -1 && host + "/.s.PGSQL." + port,
    database: o.database || o.db || (url.pathname || "").slice(1) || env2.PGDATABASE || user,
    user,
    pass: o.pass || o.password || url.password || env2.PGPASSWORD || "",
    ...Object.entries(defaults).reduce(
      (acc, [k, d]) => {
        const value = k in o ? o[k] : k in query ? query[k] === "disable" || query[k] === "false" ? false : query[k] : env2["PG" + k.toUpperCase()] || d;
        acc[k] = typeof value === "string" && ints.includes(k) ? +value : value;
        return acc;
      },
      {}
    ),
    connection: {
      application_name: env2.PGAPPNAME || "postgres.js",
      ...o.connection,
      ...Object.entries(query).reduce((acc, [k, v]) => (k in defaults || (acc[k] = v), acc), {})
    },
    types: o.types || {},
    target_session_attrs: tsa(o, url, env2),
    onnotice: o.onnotice,
    onnotify: o.onnotify,
    onclose: o.onclose,
    onparameter: o.onparameter,
    socket: o.socket,
    transform: parseTransform(o.transform || { undefined: void 0 }),
    parameters: {},
    shared: { retries: 0, typeArrayMap: {} },
    ...mergeUserTypes(o.types)
  };
}
function tsa(o, url, env2) {
  const x = o.target_session_attrs || url.searchParams.get("target_session_attrs") || env2.PGTARGETSESSIONATTRS;
  if (!x || ["read-write", "read-only", "primary", "standby", "prefer-standby"].includes(x))
    return x;
  throw new Error("target_session_attrs " + x + " is not supported");
}
function backoff(retries) {
  return (0.5 + Math.random() / 2) * Math.min(3 ** retries / 100, 20);
}
function max_lifetime() {
  return 60 * (30 + Math.random() * 30);
}
function parseTransform(x) {
  return {
    undefined: x.undefined,
    column: {
      from: typeof x.column === "function" ? x.column : x.column && x.column.from,
      to: x.column && x.column.to
    },
    value: {
      from: typeof x.value === "function" ? x.value : x.value && x.value.from,
      to: x.value && x.value.to
    },
    row: {
      from: typeof x.row === "function" ? x.row : x.row && x.row.from,
      to: x.row && x.row.to
    }
  };
}
function parseUrl(url) {
  if (!url || typeof url !== "string")
    return { url: { searchParams: /* @__PURE__ */ new Map() } };
  let host = url;
  host = host.slice(host.indexOf("://") + 3).split(/[?/]/)[0];
  host = decodeURIComponent(host.slice(host.indexOf("@") + 1));
  const urlObj = new URL(url.replace(host, host.split(",")[0]));
  return {
    url: {
      username: decodeURIComponent(urlObj.username),
      password: decodeURIComponent(urlObj.password),
      host: urlObj.host,
      hostname: urlObj.hostname,
      port: urlObj.port,
      pathname: urlObj.pathname,
      searchParams: urlObj.searchParams
    },
    multihost: host.indexOf(",") > -1 && host
  };
}
function osUsername() {
  try {
    return os.userInfo().username;
  } catch (_) {
    return process.env.USERNAME || process.env.USER || process.env.LOGNAME;
  }
}

// ../../packages/db/src/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adminAuditLog: () => adminAuditLog,
  apiIdempotencyKeys: () => apiIdempotencyKeys,
  owners: () => owners,
  tenantConfig: () => tenantConfig,
  tenantDeployments: () => tenantDeployments,
  tenantLifecycleJobs: () => tenantLifecycleJobs,
  tenantProvisionEvents: () => tenantProvisionEvents,
  tenants: () => tenants
});
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
var owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("super_admin"),
    status: text("status").notNull().default("active"),
    sessionVersion: integer("session_version").notNull().default(1),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    mfaSecret: text("mfa_secret"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    inviteToken: text("invite_token"),
    inviteTokenExpiresAt: timestamp("invite_token_expires_at", {
      withTimezone: true
    }),
    invitedById: uuid("invited_by_id").references(() => owners.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("owners_email_unique").on(t.email)]
);
var tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "restrict" }),
    /** Stockix bootstrap admin (not the Stockix platform owner). */
    adminEmail: text("admin_email").notNull(),
    adminFirstName: text("admin_first_name").notNull(),
    adminLastName: text("admin_last_name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("tenants_slug_unique").on(t.slug)]
);
var tenantConfig = pgTable("tenant_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().unique().references(() => tenants.id, { onDelete: "cascade" }),
  appName: text("app_name"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  branding: jsonb("branding").$type(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var tenantDeployments = pgTable(
  "tenant_deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    /** Unique Docker Compose project name per tenant (e.g. stockix_tenant_acme). */
    composeProjectName: text("compose_project_name").notNull(),
    /** Internal port the tenant stack exposes to Traefik (host networking / overlay TBD). */
    internalPort: integer("internal_port").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    mysqlPassword: text("mysql_password").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    mysqlRootPassword: text("mysql_root_password").notNull(),
    /** Encrypted ciphertext at rest (`enc:v1:*`) */
    jwtSecret: text("jwt_secret").notNull(),
    /** MongoDB URL scoped to the tenant stack (e.g. mongodb://mongo/stockix). */
    mongoUrl: text("mongo_url").notNull(),
    lastError: text("last_error"),
    registrationCompletedAt: timestamp("registration_completed_at", {
      withTimezone: true
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("tenant_deployments_tenant_id_idx").on(t.tenantId),
    uniqueIndex("tenant_deployments_compose_project_name_unique").on(
      t.composeProjectName
    )
  ]
);
var tenantProvisionEvents = pgTable(
  "tenant_provision_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    correlationId: text("correlation_id").notNull(),
    slug: text("slug"),
    tenantId: uuid("tenant_id"),
    deploymentId: uuid("deployment_id"),
    phase: text("phase").notNull(),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    meta: jsonb("meta").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("tpe_correlation_created_idx").on(t.correlationId, t.createdAt)]
);
var adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").notNull().references(() => owners.id),
    action: text("action").notNull(),
    targetTenantId: uuid("target_tenant_id").references(() => tenants.id),
    targetOwnerId: uuid("target_owner_id").references(() => owners.id),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("admin_audit_log_actor_created_idx").on(t.actorId, t.createdAt),
    index("admin_audit_log_tenant_created_idx").on(t.targetTenantId, t.createdAt),
    index("admin_audit_log_owner_created_idx").on(t.targetOwnerId, t.createdAt)
  ]
);
var apiIdempotencyKeys = pgTable(
  "api_idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    actorId: uuid("actor_id").notNull().references(() => owners.id, {
      onDelete: "cascade"
    }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    responseBody: jsonb("response_body").$type(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (t) => [
    uniqueIndex("api_idempotency_keys_actor_key_unique").on(t.actorId, t.key),
    index("api_idempotency_keys_actor_created_idx").on(t.actorId, t.createdAt),
    index("api_idempotency_keys_expires_idx").on(t.expiresAt)
  ]
);
var tenantLifecycleJobs = pgTable(
  "tenant_lifecycle_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    correlationId: text("correlation_id"),
    payload: jsonb("payload").$type().notNull(),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("tenant_lifecycle_jobs_status_run_at_idx").on(t.status, t.runAt, t.priority),
    index("tenant_lifecycle_jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("tenant_lifecycle_jobs_correlation_created_idx").on(t.correlationId, t.createdAt)
  ]
);

// ../../packages/db/src/allocate-tenant-port.ts
import { sql } from "drizzle-orm";
var TenantPortExhaustedError = class extends Error {
  constructor(maxPort) {
    super(
      `No tenant ports left (sequence exceeded MAX_TENANT_PORT=${maxPort}). Raise the sequence MAXVALUE or MAX_TENANT_PORT.`
    );
    this.name = "TenantPortExhaustedError";
  }
};
async function allocateTenantPort(db, maxPort) {
  const rows = await db.execute(
    sql`SELECT nextval('tenant_port_seq')::int AS "port"`
  );
  const row = rows[0];
  const port = row?.port;
  if (typeof port !== "number" || !Number.isFinite(port) || port > maxPort) {
    throw new TenantPortExhaustedError(maxPort);
  }
  return port;
}

// ../../packages/db/src/index.ts
function createDb(connectionString) {
  const client = src_default(connectionString);
  return drizzle(client, { schema: schema_exports });
}

// ../../infra/worker-service/src/worker.ts
import { eq as eq3, sql as sql2 } from "drizzle-orm";
import { z as z2 } from "zod";

// ../../infra/worker-service/domain/provisioner.ts
import { rm, stat } from "fs/promises";
import { join as join7 } from "path";
import { eq as eq2 } from "drizzle-orm";

// ../../infra/worker-service/domain/env-paths.ts
import { homedir } from "os";
import { join } from "path";
var isWin = process.platform === "win32";
function defaultTenantEnvRoot() {
  const override = apiConfig.tenantEnvRoot;
  if (override) return override;
  if (isWin) return join(homedir(), ".stockix", "tenants");
  if (apiConfig.nodeEnv !== "production") return join(homedir(), ".stockix", "tenants");
  return "/opt/stockix/tenants";
}

// ../../infra/worker-service/domain/provision-paths.ts
import { join as join3 } from "path";

// ../../infra/worker-service/domain/repo-root.ts
import { dirname, join as join2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { existsSync as existsSync2 } from "fs";
function getRepoRoot() {
  const override = apiConfig.repoRoot;
  if (override) return override;
  const here = dirname(fileURLToPath2(import.meta.url));
  const candidate = join2(here, "..", "..", "..");
  if (existsSync2(join2(candidate, "package.json"))) {
    return candidate;
  }
  return join2(here, "..", "..", "..", "..");
}

// ../../infra/worker-service/domain/provision-paths.ts
function getTenantStackPaths() {
  const repoRoot = getRepoRoot();
  const stockixFinanceRoot = apiConfig.stockixTenantAppRoot || join3(repoRoot, "services/stockix-finance");
  return {
    repoRoot,
    stockixFinanceRoot,
    tenantComposeFile: join3(repoRoot, "infra/tenant-stack/docker-compose.yml")
  };
}

// ../../infra/worker-service/domain/provisioning/compose-project-name.ts
function composeProjectName(slug) {
  return `stockix-${slug}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

// ../../infra/worker-service/src/provision-runtime.ts
import { mkdir as mkdir2 } from "fs/promises";
import { join as join5 } from "path";
import { createCipheriv, randomBytes } from "crypto";
import { execa } from "execa";
import { asc, eq } from "drizzle-orm";

// ../../infra/worker-service/domain/provision-trace.ts
function createProvisionTracer(db, correlationId, getContext, log) {
  return {
    async event(phase, message, opts) {
      const level = opts?.level ?? "info";
      const rawMeta = opts?.meta ?? null;
      let meta = rawMeta;
      if (meta && "oneTimeAdminPassword" in meta) {
        const { oneTimeAdminPassword: _scrubbed, ...rest } = meta;
        meta = rest;
      }
      const ctx = getContext();
      log(`[${phase}] ${message}`);
      await db.insert(tenantProvisionEvents).values({
        correlationId,
        slug: ctx.slug,
        tenantId: ctx.tenantId ?? null,
        deploymentId: ctx.deploymentId ?? null,
        phase,
        level,
        message,
        meta
      });
    }
  };
}

// ../../infra/worker-service/domain/provisioning/constants.ts
var STOCKIX_FINANCE_HEALTH_TIMEOUT_MS = 18e4;
var STOCKIX_FINANCE_HEALTH_POLL_MS = 2e3;

// ../../infra/worker-service/domain/provisioning/tenant-env.ts
import { mkdir, rename, writeFile } from "fs/promises";
import { join as join4 } from "path";
function buildTenantComposeEnvBody(params) {
  const lines = [
    `STOCKIX_TENANT_APP_ROOT=${params.stockixFinanceRoot}`,
    `BASE_URL=${params.baseUrl}`,
    `DB_CLIENT=mysql`,
    `DB_HOST=mysql`,
    `DB_USER=stockix_tenant`,
    `DB_PASSWORD=${params.dbPassword}`,
    `DB_ROOT_PASSWORD=${params.dbRootPassword}`,
    `DB_CHARSET=utf8`,
    `SYSTEM_DB_CLIENT=mysql`,
    `SYSTEM_DB_HOST=mysql`,
    `SYSTEM_DB_USER=stockix_tenant`,
    `SYSTEM_DB_PASSWORD=${params.dbPassword}`,
    `SYSTEM_DB_NAME=stockix_system`,
    `TENANT_DB_CLIENT=mysql`,
    `TENANT_DB_HOST=mysql`,
    `TENANT_DB_USER=stockix_tenant`,
    `TENANT_DB_PASSWORD=${params.dbPassword}`,
    `TENANT_DB_NAME_PERFIX=stockix_tenant_`,
    `JWT_SECRET=${params.jwtSecret}`,
    `MONGODB_DATABASE_URL=mongodb://mongo/stockix`,
    `PUBLIC_PROXY_PORT=${params.publicProxyPort}`,
    `PUBLIC_PROXY_SSL_PORT=443`,
    `SIGNUP_DISABLED=true`,
    `SIGNUP_ALLOWED_DOMAINS=`,
    `SIGNUP_ALLOWED_EMAILS=${params.signupAllowedEmails}`,
    `MAIL_HOST=`,
    `MAIL_USERNAME=`,
    `MAIL_PASSWORD=`,
    `MAIL_PORT=`,
    `MAIL_SECURE=`,
    `MAIL_FROM_NAME=`,
    `MAIL_FROM_ADDRESS=`,
    `AGENDASH_AUTH_USER=${params.agendashUser}`,
    `AGENDASH_AUTH_PASSWORD=${params.agendashPassword}`
  ];
  return `${lines.join("\n")}
`;
}
async function writeTenantEnvFileAtomic(tenantEnvDir, contents) {
  await mkdir(tenantEnvDir, { recursive: true, mode: 448 });
  const target = join4(tenantEnvDir, ".env");
  const tmp = join4(tenantEnvDir, ".env.tmp");
  await writeFile(tmp, contents, { mode: 384 });
  await rename(tmp, target);
  return target;
}

// ../../infra/worker-service/domain/provisioning/tenant-docker-workflow.ts
async function composeDownBestEffort(runner, ctx) {
  const result = await runner.run(
    ctx.composeFile,
    ctx.project,
    ctx.envPath,
    ctx.composeEnv,
    ["down", "--remove-orphans", "-v", "--timeout", "30"],
    { timeoutMs: 2 * 60 * 1e3 }
  ).then(() => true).catch(() => false);
  return result;
}

// ../../infra/worker-service/src/provision-runtime.ts
function encryptDeploymentSecret(plaintext) {
  const key = Buffer.from(apiConfig.deploymentSecretKey, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}
async function loadProvisionJournal(db, correlationId) {
  const rows = await db.select({
    phase: tenantProvisionEvents.phase,
    meta: tenantProvisionEvents.meta
  }).from(tenantProvisionEvents).where(eq(tenantProvisionEvents.correlationId, correlationId)).orderBy(asc(tenantProvisionEvents.createdAt)).limit(2e3);
  const journal = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (row.phase !== "journal") continue;
    const key = row.meta && typeof row.meta === "object" ? row.meta.operationKey : void 0;
    if (key && key.length > 0) {
      journal.add(key);
    }
  }
  return journal;
}
async function resolveServerInternalUrl(params) {
  try {
    const { stdout } = await execa(
      "docker",
      [
        "compose",
        "-f",
        params.composeFile,
        "-p",
        params.project,
        "--env-file",
        params.envPath,
        "port",
        "server",
        "3000"
      ],
      { env: params.composeEnv, extendEnv: true, stdio: "pipe" }
    );
    const trimmed = stdout.trim();
    const match = trimmed.match(/:(\d+)\s*$/);
    if (match?.[1]) {
      return `http://${params.fallbackHost}:${match[1]}`;
    }
  } catch {
  }
  return `http://${params.fallbackHost}:${params.fallbackPort}`;
}
async function executeProvisionRuntime(deps, db, input, log, correlationId, assertNotCancelled) {
  const runtimeStartedAt = Date.now();
  let tenantId;
  let deploymentId;
  const trace = createProvisionTracer(
    db,
    correlationId,
    () => ({ slug: input.slug, tenantId, deploymentId }),
    log
  );
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const rootDomain = apiConfig.rootDomain || "example.com";
  const publicScheme = apiConfig.publicBaseUrlScheme;
  const maxPort = apiConfig.maxTenantPort;
  const tenantEnvRoot = defaultTenantEnvRoot();
  const project = composeProjectName(input.slug);
  const baseUrl = `${publicScheme}://${input.slug}.${rootDomain}`;
  const requestId = correlationId;
  let port;
  let oneTimeAdminPassword;
  let composeCtx = null;
  let sideEffectsStarted = false;
  const completedOps = await loadProvisionJournal(db, correlationId);
  const checkNotCancelled = async () => {
    if (!assertNotCancelled) return;
    await assertNotCancelled();
  };
  const runComposeWithCancellation = async (args) => {
    log(`[compose] starting: docker compose ${args.join(" ")}`);
    const controller = new AbortController();
    const intervalId = setInterval(() => {
      checkNotCancelled().catch((error) => {
        if (!controller.signal.aborted) {
          log(
            `[compose] cancellation requested during ${args.join(" ")}: ${error instanceof Error ? error.message : String(error)}`
          );
          controller.abort(error);
        }
      });
    }, 1e3);
    try {
      const timeoutMs = args[0] === "run" ? 10 * 60 * 1e3 : args.includes("mysql") || args.includes("mongo") || args.includes("redis") ? 5 * 60 * 1e3 : 5 * 60 * 1e3;
      await deps.docker.run(
        composeCtx.composeFile,
        composeCtx.project,
        composeCtx.envPath,
        composeCtx.composeEnv,
        args,
        { cancelSignal: controller.signal, timeoutMs }
      );
      log(`[compose] completed: docker compose ${args.join(" ")}`);
      await checkNotCancelled();
    } catch (error) {
      log(
        `[compose] failed: docker compose ${args.join(" ")} :: ${error instanceof Error ? error.message : String(error)}`
      );
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason instanceof Error) {
          throw reason;
        }
        throw new Error(typeof reason === "string" ? reason : "cancelled_by_user");
      }
      throw error;
    } finally {
      clearInterval(intervalId);
    }
  };
  const hasOp = (key) => completedOps.has(key);
  const elapsedMs = () => Date.now() - runtimeStartedAt;
  const markOp = async (operationKey, message, meta) => {
    completedOps.add(operationKey);
    await trace.event("journal", message, {
      meta: {
        operationKey,
        ...meta
      }
    });
  };
  const recordCleanupError = async (step, error) => {
    const msg = error instanceof Error ? error.message : String(error);
    try {
      await trace.event("cleanup", `non-fatal error in ${step}: ${msg}`, {
        level: "error",
        meta: { step, error: msg }
      });
    } catch {
      console.error(`[provision][${correlationId}] cleanup log failure step=${step}: ${msg}`);
    }
  };
  try {
    log(`[provision] start slug=${input.slug} correlationId=${correlationId}`);
    await checkNotCancelled();
    await mkdir2(join5(stockixFinanceRoot, "data/logs/nginx"), { recursive: true });
    await mkdir2(join5(stockixFinanceRoot, "docker/certbot/certs"), { recursive: true });
    const { secrets } = deps;
    oneTimeAdminPassword = secrets.bootstrapAdminPassword();
    const jwtSecret = secrets.persistSecret(secrets.randomHex(32));
    const dbPassword = secrets.persistSecret(secrets.randomHex(16));
    const dbRootPassword = secrets.persistSecret(secrets.randomHex(16));
    const mongoUrlPersisted = "mongodb://mongo/stockix";
    const agendashUser = "agendash";
    const agendashPassword = secrets.persistSecret(secrets.randomHex(12));
    const existingSlug = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug)).limit(1);
    if (existingSlug.length > 0) {
      throw new Error(`tenant_slug_exists:${input.slug}`);
    }
    await db.transaction(async (tx) => {
      const allocated = await allocateTenantPort(tx, maxPort);
      port = allocated;
      const [tRow] = await tx.insert(tenants).values({
        slug: input.slug,
        name: input.name,
        ownerId: input.ownerId,
        adminEmail: input.adminEmail,
        adminFirstName: input.adminFirstName,
        adminLastName: input.adminLastName,
        status: "provisioning"
      }).returning({ id: tenants.id });
      tenantId = tRow.id;
      const [dRow] = await tx.insert(tenantDeployments).values({
        tenantId,
        status: "provisioning",
        composeProjectName: project,
        internalPort: allocated,
        mysqlPassword: encryptDeploymentSecret(dbPassword),
        mysqlRootPassword: encryptDeploymentSecret(dbRootPassword),
        jwtSecret: encryptDeploymentSecret(jwtSecret),
        mongoUrl: mongoUrlPersisted
      }).returning({ id: tenantDeployments.id });
      deploymentId = dRow.id;
    });
    await checkNotCancelled();
    const envBody = buildTenantComposeEnvBody({
      stockixFinanceRoot,
      baseUrl,
      jwtSecret,
      dbPassword,
      dbRootPassword,
      publicProxyPort: port,
      signupAllowedEmails: input.adminEmail,
      agendashUser,
      agendashPassword
    });
    const envPath = await writeTenantEnvFileAtomic(join5(tenantEnvRoot, input.slug), envBody);
    const composeEnv = {
      STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot,
      BASE_URL: baseUrl,
      DB_CLIENT: "mysql",
      DB_HOST: "mysql",
      DB_USER: "stockix_tenant",
      DB_PASSWORD: dbPassword,
      DB_ROOT_PASSWORD: dbRootPassword,
      DB_CHARSET: "utf8",
      SYSTEM_DB_CLIENT: "mysql",
      SYSTEM_DB_HOST: "mysql",
      SYSTEM_DB_USER: "stockix_tenant",
      SYSTEM_DB_PASSWORD: dbPassword,
      SYSTEM_DB_NAME: "stockix_system",
      TENANT_DB_CLIENT: "mysql",
      TENANT_DB_HOST: "mysql",
      TENANT_DB_USER: "stockix_tenant",
      TENANT_DB_PASSWORD: dbPassword,
      TENANT_DB_NAME_PERFIX: "stockix_tenant_",
      JWT_SECRET: jwtSecret,
      PUBLIC_PROXY_PORT: String(port),
      PUBLIC_PROXY_SSL_PORT: "443",
      SIGNUP_DISABLED: "true",
      SIGNUP_ALLOWED_DOMAINS: "",
      SIGNUP_ALLOWED_EMAILS: input.adminEmail,
      MAIL_HOST: "",
      MAIL_USERNAME: "",
      MAIL_PASSWORD: "",
      MAIL_PORT: "",
      MAIL_SECURE: "",
      MAIL_FROM_NAME: "",
      MAIL_FROM_ADDRESS: "",
      AGENDASH_AUTH_USER: agendashUser,
      AGENDASH_AUTH_PASSWORD: agendashPassword
    };
    composeCtx = { composeFile, project, envPath, composeEnv };
    const { docker, finance, edge } = deps;
    await checkNotCancelled();
    const staleContainersRaw = await execa(
      "docker",
      ["ps", "-a", "--filter", `name=${project}`, "--format", "{{.Names}}"],
      { stdio: "pipe" }
    ).then(({ stdout }) => stdout).catch(() => "");
    const staleContainers = staleContainersRaw.split("\n").map((v) => v.trim()).filter((v) => v.length > 0);
    if (staleContainers.length > 0) {
      await trace.event("preflight.cleanup", "Detected stale project containers before provision", {
        level: "warn",
        meta: { composeProjectName: project, staleContainers }
      });
    }
    await docker.run(
      composeCtx.composeFile,
      composeCtx.project,
      composeCtx.envPath,
      composeCtx.composeEnv,
      ["down", "--remove-orphans", "-v", "--timeout", "10"],
      { timeoutMs: 2 * 60 * 1e3 }
    ).catch(() => void 0);
    await trace.event("preflight.cleanup", "completed", {
      meta: { composeProjectName: project }
    });
    sideEffectsStarted = true;
    await checkNotCancelled();
    if (!hasOp("docker.data_step")) {
      log("[provision] step start: docker.data_step");
      await runComposeWithCancellation(["up", "-d", "--no-deps", "--remove-orphans", "mysql", "mongo", "redis"]);
      await markOp("docker.data_step", "Data services compose step completed", {
        composeProjectName: project
      });
      log("[provision] step done: docker.data_step");
    } else {
      await trace.event("resume", "Skipping data step (already journaled)", {
        meta: { operationKey: "docker.data_step", composeProjectName: project }
      });
    }
    await checkNotCancelled();
    if (!hasOp("docker.migration_step")) {
      log("[provision] step start: docker.migration_step");
      log("database_migration");
      await runComposeWithCancellation(["run", "--rm", "database_migration"]);
      await markOp("docker.migration_step", "Migration compose step completed", {
        composeProjectName: project,
        elapsedMs: elapsedMs()
      });
      await trace.event("progress", "Post-migration checkpoint reached", {
        meta: { operationKey: "docker.migration_step", elapsedMs: elapsedMs() }
      });
      log("[provision] step done: docker.migration_step");
    } else {
      await trace.event("resume", "Skipping migration step (already journaled)", {
        meta: { operationKey: "docker.migration_step", composeProjectName: project }
      });
    }
    await checkNotCancelled();
    if (!hasOp("docker.app_step")) {
      log("[provision] step start: docker.app_step");
      await trace.event("progress", "Starting app compose step", {
        meta: { operationKey: "docker.app_step", elapsedMs: elapsedMs() }
      });
      await runComposeWithCancellation(["up", "-d", "--remove-orphans", "webapp", "nginx", "server"]);
      await markOp("docker.app_step", "Application compose step completed", {
        composeProjectName: project,
        elapsedMs: elapsedMs()
      });
      log("[provision] step done: docker.app_step");
    } else {
      await trace.event("resume", "Skipping app step (already journaled)", {
        meta: { operationKey: "docker.app_step", composeProjectName: project }
      });
    }
    await checkNotCancelled();
    const internalUrl = await resolveServerInternalUrl({
      composeFile,
      project,
      envPath: composeCtx.envPath,
      composeEnv: composeCtx.composeEnv,
      fallbackHost: apiConfig.tenantInternalHost,
      fallbackPort: port
    });
    if (!hasOp("tenant.health_check")) {
      log("[provision] step start: tenant.health_check");
      await trace.event("progress", "Waiting for tenant health endpoint", {
        meta: { operationKey: "tenant.health_check", elapsedMs: elapsedMs(), internalUrl }
      });
      await finance.waitUntilReady(
        internalUrl,
        STOCKIX_FINANCE_HEALTH_TIMEOUT_MS,
        log,
        requestId,
        trace
      );
      await markOp("tenant.health_check", "Tenant health check completed", { internalUrl, elapsedMs: elapsedMs() });
      log("[provision] step done: tenant.health_check");
    } else {
      await trace.event("resume", "Skipping health check (already journaled)", {
        meta: { operationKey: "tenant.health_check", internalUrl }
      });
    }
    await checkNotCancelled();
    if (!hasOp("tenant.bootstrap_admin")) {
      log("[provision] step start: tenant.bootstrap_admin");
      await trace.event("progress", "Starting bootstrap admin registration", {
        meta: { operationKey: "tenant.bootstrap_admin", elapsedMs: elapsedMs(), adminEmail: input.adminEmail }
      });
      await finance.registerBootstrapAdmin({
        internalBaseUrl: internalUrl,
        firstName: input.adminFirstName,
        lastName: input.adminLastName,
        email: input.adminEmail,
        password: oneTimeAdminPassword,
        log,
        requestId,
        trace
      });
      await markOp("tenant.bootstrap_admin", "Tenant bootstrap admin registered", {
        internalBaseUrl: internalUrl,
        adminEmail: input.adminEmail,
        elapsedMs: elapsedMs()
      });
      log("[provision] step done: tenant.bootstrap_admin");
    } else {
      await trace.event("resume", "Skipping bootstrap admin registration (already journaled)", {
        meta: { operationKey: "tenant.bootstrap_admin", adminEmail: input.adminEmail }
      });
    }
    await checkNotCancelled();
    if (!hasOp("edge.publish")) {
      log("[provision] step start: edge.publish");
      try {
        await edge.publish(input.slug, port, rootDomain);
      } catch (error) {
        await trace.event("edge", "Traefik edge publish failed", {
          level: "error",
          meta: {
            slug: input.slug,
            internalPort: port,
            error: error instanceof Error ? error.message : String(error)
          }
        });
        throw error;
      }
      await markOp("edge.publish", "Traefik edge publish completed", {
        slug: input.slug,
        internalPort: port
      });
      log("[provision] step done: edge.publish");
    } else {
      await trace.event("resume", "Skipping edge publish (already journaled)", {
        meta: { operationKey: "edge.publish", slug: input.slug, internalPort: port }
      });
    }
    log(`[provision] success slug=${input.slug} tenantId=${tenantId}`);
    return {
      ok: true,
      tenantId,
      deploymentId,
      composeProjectName: project,
      internalPort: port,
      baseUrl,
      oneTimeAdminPassword
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (tenantId) {
      await db.update(tenants).set({ status: "failed" }).where(eq(tenants.id, tenantId)).catch((error) => recordCleanupError("tenant_status_failed_update", error));
    }
    if (deploymentId) {
      await db.update(tenantDeployments).set({ status: "failed", lastError: message, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tenantDeployments.id, deploymentId)).catch((error) => recordCleanupError("deployment_status_failed_update", error));
    }
    if (sideEffectsStarted && composeCtx) {
      await trace.event("cleanup", "Attempting best-effort compose rollback", {
        level: "warn",
        meta: { composeProjectName: composeCtx.project }
      }).catch((error) => recordCleanupError("cleanup_event_before_rollback", error));
      const rolledBack = await composeDownBestEffort(deps.docker, composeCtx);
      if (rolledBack && tenantId) {
        await db.delete(tenants).where(eq(tenants.id, tenantId)).catch((error) => recordCleanupError("tenant_delete_after_rollback", error));
        await trace.event("cleanup", "Compose rollback completed and tenant records removed", {
          level: "info",
          meta: { composeProjectName: composeCtx.project, tenantId }
        }).catch((error) => recordCleanupError("cleanup_event_after_rollback", error));
      } else if (!rolledBack) {
        await trace.event("cleanup", "Compose rollback failed; tenant marked failed for operator recovery", {
          level: "error",
          meta: { composeProjectName: composeCtx.project, tenantId, deploymentId }
        }).catch((error) => recordCleanupError("cleanup_event_rollback_failed", error));
      }
    }
    await trace.event("failed", message, { level: "error", meta: { cause: String(err) } }).catch((error) => recordCleanupError("final_failed_event", error));
    log(`[provision] failed slug=${input.slug} correlationId=${correlationId}: ${message}`);
    return { ok: false, message, cause: String(err) };
  }
}

// ../../infra/worker-service/domain/provisioning/tenant-provision-service.ts
var TenantProvisionService = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  async provision(db, input, log, correlationId, assertNotCancelled) {
    return executeProvisionRuntime(this.deps, db, input, log, correlationId, assertNotCancelled);
  }
};

// ../../infra/worker-service/domain/provisioning/adapters/crypto-tenant-secret-generator.ts
import { randomBytes as randomBytes2 } from "crypto";
var CryptoTenantSecretGenerator = class {
  persistSecret(plaintext) {
    return plaintext;
  }
  randomHex(bytes = 32) {
    return randomBytes2(bytes).toString("hex");
  }
  bootstrapAdminPassword() {
    const s = randomBytes2(18).toString("base64url");
    return s.length >= 12 ? s.slice(0, 24) : `${s}Aa1!extra`;
  }
};

// ../../infra/worker-service/domain/provisioning/adapters/execa-docker-compose-runner.ts
import { execa as execa2 } from "execa";
var ExecaDockerComposeRunner = class {
  async run(composeFile, project, envFile, composeEnv, args, options) {
    const execaOptions = {
      env: composeEnv,
      stdio: "pipe",
      extendEnv: true,
      forceKillAfterDelay: 500,
      timeout: options?.timeoutMs
    };
    const subprocess = execa2(
      "docker",
      ["compose", "-f", composeFile, "-p", project, "--env-file", envFile, ...args],
      execaOptions
    );
    let abortHandler;
    const cancelSignal = options?.cancelSignal;
    if (cancelSignal) {
      abortHandler = () => {
        if (process.platform === "win32" && typeof subprocess.pid === "number") {
          void execa2("taskkill", ["/PID", String(subprocess.pid), "/T", "/F"]).catch(() => void 0);
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
    try {
      await subprocess;
    } finally {
      if (cancelSignal && abortHandler) {
        cancelSignal.removeEventListener("abort", abortHandler);
      }
    }
  }
};

// ../../infra/worker-service/domain/provisioning/adapters/fetch-stockix-finance-bootstrap.ts
var FetchStockixFinanceBootstrap = class {
  async waitUntilReady(internalBaseUrl, timeoutMs, log, requestId, trace) {
    const url = `${internalBaseUrl}/api/ping/`;
    const started = Date.now();
    const deadline = started + timeoutMs;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5e3),
          headers: requestId ? {
            "x-request-id": requestId,
            "x-correlation-id": requestId
          } : void 0
        });
        if (res.ok) {
          log(`stockix finance healthy at ${url}`);
          await trace?.event("health", "Stockix Finance /api/ping is healthy", {
            meta: { url, pollMs: STOCKIX_FINANCE_HEALTH_POLL_MS }
          });
          return;
        }
        lastError = `HTTP ${res.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, STOCKIX_FINANCE_HEALTH_POLL_MS));
    }
    throw new Error(
      `Stockix Finance did not become ready within ${timeoutMs}ms (last error: ${lastError || "unknown"})`
    );
  }
  async registerBootstrapAdmin(params) {
    const url = `${params.internalBaseUrl}/api/auth/register`;
    const maxAttempts = 3;
    const requestTimeoutMs2 = 1e4;
    let lastFailure = "unknown";
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStartedAt = Date.now();
      await params.trace?.event("bootstrap", "Bootstrap registration attempt", {
        meta: {
          url,
          attempt,
          maxAttempts
        }
      });
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...params.requestId ? {
              "x-request-id": params.requestId,
              "x-correlation-id": params.requestId
            } : {}
          },
          body: JSON.stringify({
            first_name: params.firstName,
            last_name: params.lastName,
            email: params.email,
            password: params.password
          }),
          signal: AbortSignal.timeout(requestTimeoutMs2)
        });
        if (res.ok) {
          await params.trace?.event("bootstrap", "Bootstrap registration succeeded", {
            meta: {
              url,
              attempt,
              elapsedMs: Date.now() - attemptStartedAt
            }
          });
          return;
        }
        const text2 = await res.text();
        lastFailure = `HTTP ${res.status} ${text2.slice(0, 500)}`;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
      await params.trace?.event("bootstrap", "Bootstrap registration attempt failed", {
        level: "warn",
        meta: {
          url,
          attempt,
          maxAttempts,
          elapsedMs: Date.now() - attemptStartedAt,
          error: lastFailure
        }
      });
      if (attempt < maxAttempts) {
        const backoffMs = Math.min(5e3, attempt * 1500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    throw new Error(`register failed: ${lastFailure} url=${url}`);
  }
};

// ../../infra/worker-service/domain/traefik-config.ts
import { mkdir as mkdir3, unlink, writeFile as writeFile2 } from "fs/promises";
import { join as join6 } from "path";
function traefikDir() {
  return apiConfig.traefikDynamicDir;
}
function tenantUpstreamHost() {
  return apiConfig.traefikTenantUpstreamHost;
}
async function writeTenantTraefikConfig(slug, port, domain) {
  const dir = traefikDir();
  await mkdir3(dir, { recursive: true });
  const config = `http:
  routers:
    tenant-${slug}:
      rule: "Host(\`${slug}.${domain}\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: cloudflare
      service: tenant-${slug}
  services:
    tenant-${slug}:
      loadBalancer:
        servers:
          - url: "http://${tenantUpstreamHost()}:${port}"
`;
  await writeFile2(join6(dir, `tenant-${slug}.yml`), config, "utf8");
}
async function removeTenantTraefikConfig(slug) {
  try {
    await unlink(join6(traefikDir(), `tenant-${slug}.yml`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("no such file")) {
      throw error;
    }
  }
}

// ../../infra/worker-service/domain/provisioning/adapters/traefik-edge-publisher.ts
var TraefikEdgePublisher = class {
  async publish(slug, port, rootDomain) {
    await writeTenantTraefikConfig(slug, port, rootDomain);
  }
  async unpublish(slug) {
    await removeTenantTraefikConfig(slug);
  }
};

// ../../infra/worker-service/domain/provisioner.ts
var dockerRunner = new ExecaDockerComposeRunner();
var edgePublisher = new TraefikEdgePublisher();
var tenantProvisionService = new TenantProvisionService({
  docker: dockerRunner,
  secrets: new CryptoTenantSecretGenerator(),
  finance: new FetchStockixFinanceBootstrap(),
  edge: edgePublisher
});
async function provisionTenant(db, input, log, correlationId, assertNotCancelled) {
  return tenantProvisionService.provision(db, input, log, correlationId, assertNotCancelled);
}
async function deprovisionTenant(db, tenantId, options = {}) {
  const log = options.log ?? (() => void 0);
  const found = await db.select({ id: tenants.id, slug: tenants.slug, composeProject: tenantDeployments.composeProjectName }).from(tenants).leftJoin(tenantDeployments, eq2(tenantDeployments.tenantId, tenants.id)).where(eq2(tenants.id, tenantId)).limit(1);
  const row = found[0];
  if (!row) return { ok: false, message: "Tenant not found" };
  const project = row.composeProject ?? composeProjectName(row.slug);
  const { tenantComposeFile: composeFile, stockixFinanceRoot } = getTenantStackPaths();
  const envPath = join7(defaultTenantEnvRoot(), row.slug, ".env");
  const composeEnv = { STOCKIX_TENANT_APP_ROOT: stockixFinanceRoot };
  let dockerStatus = "skipped";
  try {
    await stat(envPath);
    const downArgs = ["down", "--remove-orphans", "--timeout", "30"];
    if (options.removeVolumes) {
      downArgs.push("-v");
    }
    if (options.removeImages) {
      downArgs.push("--rmi", "local");
    }
    await dockerRunner.run(composeFile, project, envPath, composeEnv, downArgs, { timeoutMs: 2 * 60 * 1e3 });
    dockerStatus = "stopped";
  } catch {
    dockerStatus = "skipped";
  }
  await edgePublisher.unpublish(row.slug).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`edge unpublish failed for ${row.slug}: ${message}`);
  });
  await db.delete(tenantProvisionEvents).where(eq2(tenantProvisionEvents.tenantId, tenantId));
  await db.delete(adminAuditLog).where(eq2(adminAuditLog.targetTenantId, tenantId));
  await db.delete(tenantDeployments).where(eq2(tenantDeployments.tenantId, tenantId));
  await db.delete(tenants).where(eq2(tenants.id, tenantId));
  await rm(join7(defaultTenantEnvRoot(), row.slug), { recursive: true, force: true }).catch(() => void 0);
  log(`deprovision done for ${project}`);
  return { ok: true, slug: row.slug, composeProject: project, docker: dockerStatus };
}

// ../../infra/worker-service/src/worker.ts
var workerId = `infra-worker-${randomUUID()}`;
var pollMs = 1500;
var apiBaseUrl = `http://localhost:${apiConfig.port}`;
var requestTimeoutMs = 1e4;
var jobExecutionTimeoutMs = 10 * 60 * 1e3;
var heartbeatIntervalMs = 15e3;
var shuttingDown = false;
var runtimeFingerprint = {
  workerId,
  startedAt: (/* @__PURE__ */ new Date()).toISOString(),
  entrypoint: import.meta.url,
  nodeVersion: process.version
};
function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}
async function withExecutionTimeout(promise, timeoutMs) {
  let timer2;
  const timeout = new Promise((_, reject) => {
    timer2 = setTimeout(() => reject(new Error(`execution_timeout:${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer2) clearTimeout(timer2);
  }
}
async function emitWorkerMetric(name, value, tags) {
  const endpoint = apiConfig.metricsEndpoint;
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...apiConfig.metricsAuthToken ? { Authorization: `Bearer ${apiConfig.metricsAuthToken}` } : {}
    },
    body: JSON.stringify({
      source: "worker",
      workerId,
      name,
      value,
      tags,
      ts: (/* @__PURE__ */ new Date()).toISOString()
    }),
    signal: timeoutSignal(requestTimeoutMs)
  }).catch((error) => {
    console.error(
      `[worker] metric emit failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });
}
async function claimNextJob() {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify({ workerId }),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`claim_failed:${res.status}`);
  const body = await res.json();
  return body.job ?? null;
}
async function markJobComplete(jobId, oneTimeAdminPassword) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const completionBody = { workerId };
  if (oneTimeAdminPassword !== void 0) {
    completionBody.oneTimeAdminPassword = oneTimeAdminPassword;
  }
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify(completionBody),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`complete_failed:${res.status}`);
}
async function markJobHeartbeat(jobId) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify({ workerId }),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`heartbeat_failed:${res.status}`);
}
async function markJobFailure(jobId, message, noRetry = false) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/fail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    body: JSON.stringify({ error: message, workerId, noRetry }),
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) throw new Error(`fail_failed:${res.status}`);
}
function startJobHeartbeatLoop(jobId) {
  const timer2 = setInterval(() => {
    void markJobHeartbeat(jobId).catch((error) => {
      console.error(
        `[worker][${jobId}] heartbeat failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }, heartbeatIntervalMs);
  return () => clearInterval(timer2);
}
async function assertProvisionNotCancelled(jobId) {
  const secret = apiConfig.workerSecret;
  const requestId = randomUUID();
  const res = await fetch(`${apiBaseUrl}/internal/jobs/${jobId}/cancel-check`, {
    method: "GET",
    headers: {
      "x-request-id": requestId,
      "x-correlation-id": requestId,
      ...secret ? { Authorization: `Bearer ${secret}` } : {}
    },
    signal: timeoutSignal(requestTimeoutMs)
  });
  if (!res.ok) {
    throw new Error(`cancel_check_failed:${res.status}`);
  }
  const body = await res.json();
  if (body.cancelled) {
    throw new Error(`cancelled_by_user: ${body.reason ?? "cancelled"}`);
  }
}
var ALLOWED_LIFECYCLE_COMMANDS = ["start", "stop"];
var provisionPayloadSchema = z2.object({
  slug: z2.string().min(1),
  name: z2.string().min(1),
  ownerId: z2.string().uuid(),
  adminEmail: z2.string().email(),
  adminFirstName: z2.string().min(1),
  adminLastName: z2.string().min(1)
});
async function runProvisionJob(db, job) {
  const guard = async () => {
    await assertProvisionNotCancelled(job.id);
  };
  await guard();
  const payload = provisionPayloadSchema.parse(job.payload);
  const result = await provisionTenant(
    db,
    {
      slug: payload.slug,
      name: payload.name,
      ownerId: payload.ownerId,
      adminEmail: payload.adminEmail,
      adminFirstName: payload.adminFirstName,
      adminLastName: payload.adminLastName
    },
    (m) => console.log(`[worker][${job.id}] ${m}`),
    job.correlationId ?? randomUUID(),
    guard
  );
  if (!result.ok) {
    throw new Error(result.message);
  }
  await db.insert(adminAuditLog).values({
    actorId: String(payload.ownerId ?? ""),
    action: "tenant.create",
    targetTenantId: result.tenantId,
    ipAddress: workerId,
    userAgent: "infra-worker",
    metadata: { mode: "job_worker", jobId: job.id }
  }).catch(async (error) => {
    if (job.correlationId) {
      await db.insert(tenantProvisionEvents).values({
        correlationId: job.correlationId,
        phase: "audit",
        level: "error",
        message: "Failed to write admin audit log after successful provision",
        tenantId: result.tenantId,
        meta: {
          step: "admin_audit_log",
          error: error instanceof Error ? error.message : String(error),
          jobId: job.id
        }
      }).catch((nestedError) => {
        console.error(
          `[worker][${job.id}] failed to persist audit failure event: ${nestedError instanceof Error ? nestedError.message : String(nestedError)}`
        );
      });
    }
  });
  return result.oneTimeAdminPassword;
}
async function runDeprovisionJob(db, job) {
  if (!job.tenantId) throw new Error("tenantId is required");
  const removeVolumes = job.payload.removeVolumes === true;
  const removeImages = job.payload.removeImages === true;
  const result = await deprovisionTenant(db, job.tenantId, {
    removeVolumes,
    removeImages,
    log: (m) => console.log(`[worker][${job.id}] ${m}`)
  });
  if (!result.ok) throw new Error(result.message);
}
async function runTenantLifecycleCommand(db, job, command) {
  if (!job.tenantId) throw new Error("tenantId is required");
  const rows = await db.select({
    tenantId: tenants.id,
    slug: tenants.slug,
    composeProjectName: tenantDeployments.composeProjectName
  }).from(tenants).leftJoin(tenantDeployments, eq3(tenantDeployments.tenantId, tenants.id)).where(eq3(tenants.id, job.tenantId)).limit(1);
  const row = rows[0];
  if (!row || !row.composeProjectName) {
    throw new Error("tenant_not_found");
  }
  await execa3("docker", ["compose", "-p", row.composeProjectName, command], {
    timeout: 6e4
  });
}
var handlers = {
  "tenant.provision": runProvisionJob,
  "tenant.deprovision": runDeprovisionJob,
  "tenant.lifecycle": (db, job) => {
    const rawCommand = String(job.payload.command ?? "");
    if (!ALLOWED_LIFECYCLE_COMMANDS.includes(rawCommand)) {
      throw new Error(`Invalid lifecycle command: "${rawCommand}". Allowed: ${ALLOWED_LIFECYCLE_COMMANDS.join(", ")}`);
    }
    const command = rawCommand;
    return runTenantLifecycleCommand(db, job, command);
  }
};
function isPermanentProvisionError(message) {
  const lowered = message.toLowerCase();
  return message.startsWith("tenant_slug_exists:") || lowered.includes("tenants_slug_unique") || lowered.includes("duplicate key value violates unique constraint");
}
async function loop() {
  const databaseUrl = apiConfig.databaseUrl;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for infra worker");
  }
  const db = createDb(databaseUrl);
  console.log(JSON.stringify({ level: "info", type: "worker_start", ...runtimeFingerprint }));
  while (!shuttingDown) {
    const job = await claimNextJob().catch((error) => {
      console.error(`[worker] claim error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    if (!job) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    const stopHeartbeat = startJobHeartbeatLoop(job.id);
    try {
      const handler = handlers[job.type];
      if (!handler) {
        throw new Error(`unsupported_job_type:${job.type}`);
      }
      let oneTimeAdminPassword;
      if (job.type === "tenant.provision") {
        oneTimeAdminPassword = await withExecutionTimeout(runProvisionJob(db, job), jobExecutionTimeoutMs);
      } else {
        await withExecutionTimeout(handler(db, job), jobExecutionTimeoutMs);
      }
      await markJobComplete(job.id, oneTimeAdminPassword);
      await emitWorkerMetric("worker.job.success", 1, { jobType: job.type });
      console.log(
        JSON.stringify({
          level: "info",
          type: "worker_job_result",
          workerId,
          jobId: job.id,
          jobType: job.type,
          outcome: "success"
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker][${job.id}] failed: ${message}`);
      try {
        const cancelledByUser = message.startsWith("cancelled_by_user:");
        const noRetry = cancelledByUser || job.type === "tenant.provision" || isPermanentProvisionError(message);
        await markJobFailure(job.id, message, noRetry);
        await emitWorkerMetric("worker.job.failure", 1, { jobType: job.type });
        console.log(
          JSON.stringify({
            level: "error",
            type: "worker_job_result",
            workerId,
            jobId: job.id,
            jobType: job.type,
            outcome: "failed",
            error: message
          })
        );
      } catch (reportError) {
        console.error(
          `[worker][${job.id}] failed to report failure: ${reportError instanceof Error ? reportError.message : String(reportError)}`
        );
        const fallbackNoRetry = job.type === "tenant.provision" || isPermanentProvisionError(message);
        const status = fallbackNoRetry ? "dead" : "pending";
        const nextRunAt = fallbackNoRetry ? null : new Date(Date.now() + 3e4);
        await db.transaction(async (tx) => {
          await tx.update(tenantLifecycleJobs).set({
            status,
            lastError: `worker_fallback_failure_persist:${message}`,
            claimedAt: null,
            claimedBy: null,
            runAt: nextRunAt ?? sql2`${tenantLifecycleJobs.runAt}`,
            updatedAt: /* @__PURE__ */ new Date(),
            completedAt: fallbackNoRetry ? /* @__PURE__ */ new Date() : null,
            attempts: sql2`${tenantLifecycleJobs.attempts} + 1`
          }).where(eq3(tenantLifecycleJobs.id, job.id));
          if (job.type === "tenant.provision" && job.tenantId) {
            await tx.update(tenants).set({ status: "failed" }).where(eq3(tenants.id, job.tenantId));
            await tx.update(tenantDeployments).set({
              status: "failed",
              lastError: `worker_fallback_failure_persist:${message}`,
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq3(tenantDeployments.tenantId, job.tenantId));
          }
        }).catch((fallbackError) => {
          console.error(
            `[worker][${job.id}] fallback failure persistence failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
          );
        });
      }
    } finally {
      stopHeartbeat();
    }
  }
}
process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGTERM", workerId }));
});
process.on("SIGINT", () => {
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", type: "worker_shutdown", signal: "SIGINT", workerId }));
});
void loop();
//# sourceMappingURL=worker.js.map