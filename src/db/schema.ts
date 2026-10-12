import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
const citext = customType<{ data: string }>({ dataType: () => "citext" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Users, profiles, sessions
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["member", "reviewer", "admin"]);
export const visibility = pgEnum("visibility", ["private", "members", "public"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("member"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  handle: citext("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  homeClub: text("home_club").notNull().default(""),
  profileVisibility: visibility("profile_visibility").notNull().default("members"),
  collectionVisibility: visibility("collection_visibility").notNull().default("private"),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the opaque cookie token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

/** How much trust the platform places in an entry or claim. */
export const evidenceStatus = pgEnum("evidence_status", [
  "verified", // reviewed against at least one primary/authoritative source
  "limited_evidence", // supported by secondary sources only
  "community", // submitted by a member, not yet source-checked
  "ai_draft", // machine-generated, not reviewed
  "conflicting", // sources disagree; see claims
]);

export const entryState = pgEnum("entry_state", ["draft", "published", "archived"]);
export const bodyPosition = pgEnum("body_position", ["tuck", "pike", "straight", "straddle", "any", "none"]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    canonicalName: text("canonical_name").notNull(),
    normalizedName: text("normalized_name").notNull().unique(),
    kind: text("kind").notNull().default("skill"), // skill | term | rule
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    body: text("body").notNull().default(""),
    figNotation: text("fig_notation"),
    quarterRotations: smallint("quarter_rotations"),
    halfTwists: smallint("half_twists"),
    position: bodyPosition("position"),
    evidenceStatus: evidenceStatus("evidence_status").notNull().default("ai_draft"),
    state: entryState("state").notNull().default("draft"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // Denormalised names + aliases, maintained by the data layer for search.
    searchNames: text("search_names").notNull().default(""),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(search_names, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('english', coalesce(body, '')), 'C')`,
    ),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    // History counter: bumped by every change (text, claims, state).
    revision: integer("revision").notNull().default(1),
    // Optimistic-concurrency token for the editable text fields only, so adding a claim
    // doesn't invalidate an open edit form while concurrent text edits still conflict.
    contentVersion: integer("content_version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("entries_search_idx").using("gin", t.searchVector),
    index("entries_names_trgm_idx").using("gin", sql`${t.searchNames} gin_trgm_ops`),
    index("entries_category_idx").on(t.categoryId),
    index("entries_state_idx").on(t.state),
    index("entries_tags_idx").using("gin", t.tags),
  ],
);

export const entryAliases = pgTable(
  "entry_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [
    // An alias may only point to one entry; prevents silent duplicates.
    uniqueIndex("entry_aliases_normalized_uq").on(t.normalizedAlias),
    index("entry_aliases_entry_idx").on(t.entryId),
  ],
);

export const relationKind = pgEnum("relation_kind", ["related", "variant_of", "distinct_from", "component_of"]);

export const entryRelations = pgTable(
  "entry_relations",
  {
    fromEntryId: uuid("from_entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    toEntryId: uuid("to_entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    kind: relationKind("kind").notNull().default("related"),
    note: text("note").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.fromEntryId, t.toEntryId] }), index("entry_relations_to_idx").on(t.toEntryId)],
);

export const sourceReliability = pgEnum("source_reliability", ["primary", "secondary", "community", "unknown"]);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  normalizedUrl: text("normalized_url").notNull().unique(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull().default(""),
  reliability: sourceReliability("reliability").notNull().default("unknown"),
  publishedAt: date("published_at"),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  // How the content was obtained, e.g. "full page fetch", "search-engine excerpt", "manual reviewer entry".
  retrievalMethod: text("retrieval_method").notNull().default("manual reviewer entry"),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
});

export const claimStatus = pgEnum("claim_status", ["supported", "limited", "disputed", "unsupported"]);

/** An atomic factual statement attached to an entry, with explicit supporting sources. */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    status: claimStatus("status").notNull().default("limited"),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("claims_entry_idx").on(t.entryId)],
);

export const citationStance = pgEnum("citation_stance", ["supports", "contradicts", "context"]);

export const claimSources = pgTable(
  "claim_sources",
  {
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    stance: citationStance("stance").notNull().default("supports"),
    excerpt: text("excerpt").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.claimId, t.sourceId] }), index("claim_sources_source_idx").on(t.sourceId)],
);

export const entryRevisions = pgTable(
  "entry_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    changeSummary: text("change_summary").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entry_revisions_entry_rev_uq").on(t.entryId, t.revision)],
);

// ---------------------------------------------------------------------------
// Background jobs (research, video processing)
// ---------------------------------------------------------------------------

export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "blocked"]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // research.gap_scan | research.entry | video.probe | video.analyze
    payload: jsonb("payload").notNull().default({}),
    // Identical active jobs share a dedupe key; enforced by a partial unique index.
    dedupeKey: text("dedupe_key").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    attempts: smallint("attempts").notNull().default(0),
    maxAttempts: smallint("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    log: jsonb("log").$type<{ at: string; level: "info" | "warn" | "error"; message: string }[]>().notNull().default([]),
    result: jsonb("result"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("jobs_active_dedupe_uq").on(t.dedupeKey).where(sql`status in ('queued','running')`),
    index("jobs_pickup_idx").on(t.status, t.runAfter),
    index("jobs_kind_idx").on(t.kind, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Research drafts and review
// ---------------------------------------------------------------------------

export const reviewStatus = pgEnum("review_status", [
  "pending_review",
  "approved",
  "rejected",
  "needs_more_sources",
  "conflicting_information",
]);

export type DraftClaim = {
  statement: string;
  /** Indexes into the draft's sources list; empty = unsupported claim. */
  sourceRefs: { sourceId: string; excerpt: string; stance: "supports" | "contradicts" | "context" }[];
  flag?: "unsupported" | "conflict";
};

export type DraftPayload = {
  canonicalName: string;
  summary: string;
  aliases: string[];
  claims: DraftClaim[];
  unresolvedQuestions: string[];
  extractor: string; // which extractor produced the draft (e.g. "excerpt-v1", "llm:<model>")
};

export const researchDrafts = pgTable(
  "research_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    // Existing entry the draft proposes to improve; null = proposes a new entry.
    entryId: uuid("entry_id").references(() => entries.id, { onDelete: "cascade" }),
    possibleDuplicateOf: uuid("possible_duplicate_of").references(() => entries.id, { onDelete: "set null" }),
    topic: text("topic").notNull(),
    normalizedTopic: text("normalized_topic").notNull(),
    payload: jsonb("payload").$type<DraftPayload>().notNull(),
    // Hash of the payload content; prevents storing the same draft twice.
    contentHash: text("content_hash").notNull().unique(),
    status: reviewStatus("status").notNull().default("pending_review"),
    reviewNote: text("review_note").notNull().default(""),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("research_drafts_status_idx").on(t.status, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Personal collection and progress
// ---------------------------------------------------------------------------

export const collectionStatus = pgEnum("collection_status", ["saved", "working_on", "landed"]);

export const collectionItems = pgTable(
  "collection_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    status: collectionStatus("status").notNull().default("saved"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entryId] })],
);

export const logKind = pgEnum("log_kind", ["note", "milestone", "session"]);

export const progressLogs = pgTable(
  "progress_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").references(() => entries.id, { onDelete: "set null" }),
    videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
    kind: logKind("kind").notNull().default("note"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    occurredOn: date("occurred_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("progress_logs_user_idx").on(t.userId, t.occurredOn)],
);

// ---------------------------------------------------------------------------
// Videos and analysis
// ---------------------------------------------------------------------------

export const videoStatus = pgEnum("video_status", ["uploaded", "processing", "ready", "failed"]);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").references(() => entries.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    storageKey: text("storage_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    frameRate: text("frame_rate"),
    codec: text("codec"),
    // Storage key of a JPEG frame extracted by ffmpeg; null until processed or if extraction failed.
    posterKey: text("poster_key"),
    status: videoStatus("status").notNull().default("uploaded"),
    statusMessage: text("status_message").notNull().default(""),
    visibility: visibility("visibility").notNull().default("private"),
    hiddenByModeration: boolean("hidden_by_moderation").notNull().default(false),
    // Explicit opt-in; never assumed. Required before a clip may be used for model training.
    trainingConsent: boolean("training_consent").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("videos_owner_idx").on(t.ownerId, t.createdAt), index("videos_sha_idx").on(t.ownerId, t.sha256)],
);

export const analysisStatus = pgEnum("analysis_status", ["queued", "running", "succeeded", "failed", "unavailable"]);

export const videoAnalyses = pgTable(
  "video_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    analyzer: text("analyzer").notNull(),
    analyzerVersion: text("analyzer_version").notNull().default(""),
    status: analysisStatus("status").notNull().default("queued"),
    result: jsonb("result"),
    message: text("message").notNull().default(""),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("video_analyses_video_idx").on(t.videoId)],
);

// ---------------------------------------------------------------------------
// Community and moderation
// ---------------------------------------------------------------------------

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    entryId: uuid("entry_id").references(() => entries.id, { onDelete: "set null" }),
    videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
    visibility: visibility("visibility").notNull().default("members"),
    hiddenByModeration: boolean("hidden_by_moderation").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("posts_created_idx").on(t.createdAt), index("posts_author_idx").on(t.authorId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    hiddenByModeration: boolean("hidden_by_moderation").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("comments_post_idx").on(t.postId, t.createdAt)],
);

export const postLikes = pgTable(
  "post_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] }), index("post_likes_post_idx").on(t.postId)],
);

export const postBookmarks = pgTable(
  "post_bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

export const reportTarget = pgEnum("report_target", ["post", "comment", "video", "profile"]);
export const reportStatus = pgEnum("report_status", ["open", "actioned", "dismissed"]);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: reportTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: reportStatus("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reports_open_once_uq").on(t.reporterId, t.targetType, t.targetId).where(sql`status = 'open'`),
    index("reports_status_idx").on(t.status, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Operational tables
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** Per-call record of language-model usage, for cost monitoring and budget enforcement. */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    feature: text("feature").notNull(), // assistant | research
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    outcome: text("outcome").notNull(), // ok | error | timeout | budget_exceeded
    createdAt: createdAt(),
  },
  (t) => [index("llm_usage_created_idx").on(t.createdAt)],
);

/** Assistant interaction log. Stores the question text only for the asking user's own history. */
export const assistantQueries = pgTable(
  "assistant_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    mode: text("mode").notNull(), // llm | retrieval_only | refused
    retrievedEntryIds: uuid("retrieved_entry_ids").array().notNull().default(sql`'{}'::uuid[]`),
    answer: jsonb("answer").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("assistant_queries_user_idx").on(t.userId, t.createdAt)],
);
