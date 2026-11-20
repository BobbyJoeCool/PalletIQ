// Types for scripts/testEnv.mjs, so the TypeScript unit tests can import it (#241).

/** api/.env.test, the committed test-only environment. */
export const TEST_ENV_FILE: string;

/** Throws unless `url` is the Docker test database (127.0.0.1/localhost:3307/palletiq_test). */
export function assertTestDatabaseUrl(url: string | undefined): void;

/** Merges a .env file's text over `baseEnv` (the file wins) and checks DATABASE_URL. */
export function buildTestEnv(envFileText: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv;

/** process.env with api/.env.test applied on top, checked by buildTestEnv. */
export function readTestEnv(): NodeJS.ProcessEnv;
