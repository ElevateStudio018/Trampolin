import path from "node:path";
import os from "node:os";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://trampolin:trampolin@localhost:5432/trampolin_test";
// Tests must never call real external services.
process.env.ANTHROPIC_API_KEY = "";
process.env.SEARCH_PROVIDER = "";
process.env.SEARCH_API_KEY = "";
process.env.VIDEO_MODEL_ENDPOINT = "";
process.env.STORAGE_DIR = path.join(os.tmpdir(), `trampolin-test-storage-${process.pid}`);
process.env.VIDEO_MAX_BYTES = String(5 * 1024 * 1024);
