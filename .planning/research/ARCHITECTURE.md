# Architecture Research

**Domain:** Web Scraping/ETL System
**Researched:** 2026-02-04
**Confidence:** HIGH

## Standard Architecture

### System Overview

Production web scraping/ETL systems in 2026 follow a **microservices pattern** with clear separation between crawling, parsing, transformation, loading, and orchestration. The architecture prioritizes resilience, observability, and testability through component isolation.

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │Scheduler │  │ Monitor  │  │  Alert   │                   │
│  │ (Cron)   │  │ (Logs)   │  │(Telegram)│                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
├───────┴──────────────┴──────────────┴───────────────────────┤
│                    PROCESSING LAYER                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Crawler │→ │ Parser  │→ │Transform│→ │ Loader  │        │
│  │(Playwrgt│  │ (Excel/ │  │(Validate│  │(Postgres│        │
│  │  +Auth) │  │  CSV)   │  │  +Link) │  │  +Dedupe│        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
├───────┴─────────────┴─────────────┴─────────────┴───────────┤
│                      STORAGE LAYER                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │Raw Files │  │ Staging  │  │Production│                   │
│  │  (Temp)  │  │  Tables  │  │   DB     │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Scheduler** | Trigger jobs at intervals, manage job queue | Cron jobs, node-cron, AWS EventBridge |
| **Crawler** | Navigate site, handle auth, download raw files | Playwright, Puppeteer, Selenium |
| **Parser** | Extract structured data from raw files | xlsx, csv-parse, cheerio |
| **Transformer** | Validate, establish relationships, deduplicate | Business logic layer, validation libraries |
| **Loader** | Insert/update database with idempotency | Database client with upsert support |
| **Monitor** | Track success/failure, collect metrics | Winston, Pino, Datadog |
| **Alerter** | Notify on failures or anomalies | Telegram Bot API, email, Slack |
| **State Manager** | Track sessions, checkpoints, retry state | Database table, Redis, filesystem |

## Recommended Project Structure

```
src/
├── crawler/              # Browser automation & file download
│   ├── auth.ts          # Login & session management
│   ├── navigator.ts     # Page navigation logic
│   ├── downloader.ts    # File download orchestration
│   └── state.ts         # Checkpoint & resume logic
├── parser/              # Raw file → structured data
│   ├── excel-parser.ts  # .xlsx handling
│   ├── csv-parser.ts    # .csv handling
│   └── schemas.ts       # Expected data schemas
├── transformer/         # Data validation & enrichment
│   ├── validator.ts     # Data quality checks
│   ├── linker.ts        # Establish relationships
│   ├── deduplicator.ts  # Content-based deduplication
│   └── normalizer.ts    # Standardize formats
├── loader/              # Database persistence
│   ├── db-client.ts     # Connection pool & queries
│   ├── upsert.ts        # Idempotent writes
│   └── transaction.ts   # Atomic operations
├── orchestrator/        # Job coordination
│   ├── scheduler.ts     # Cron trigger
│   ├── pipeline.ts      # Component orchestration
│   └── recovery.ts      # Failure handling & retry
├── monitoring/          # Observability
│   ├── logger.ts        # Structured logging
│   ├── metrics.ts       # Success rates, timings
│   └── alerter.ts       # Telegram notifications
└── shared/              # Cross-cutting concerns
    ├── config.ts        # Environment variables
    ├── types.ts         # TypeScript definitions
    └── utils.ts         # Common helpers
```

### Structure Rationale

- **crawler/**: Isolated browser concerns. Testable with mock pages. Can be replaced with different automation tools without affecting downstream components.
- **parser/**: Pure functions that transform bytes → objects. No I/O, fully unit testable.
- **transformer/**: Business logic isolated from I/O. Easy to test with fixture data.
- **loader/**: Database interface isolated. Can switch databases without touching business logic.
- **orchestrator/**: Coordinates components but doesn't contain business logic. Handles cross-cutting concerns like retries.
- **monitoring/**: Observability as first-class concern. All components emit structured logs and metrics.

## Architectural Patterns

### Pattern 1: Store-Then-Transform (Raw Snapshots)

**What:** Save raw downloaded files before parsing, then parse separately. Keep raw files for reprocessing.

**When to use:** Always for production web scraping. Essential for surviving website redesigns and fixing parser bugs.

**Trade-offs:**
- ✅ Can reprocess historical data when parsing logic changes
- ✅ Audit trail for compliance
- ✅ Parser failures don't require re-crawling (expensive)
- ❌ Requires more storage (~temporary, can be cleaned after successful load)

**Example:**
```typescript
// Bad: Parse immediately, lose raw data
const data = await downloadAndParse(url);

// Good: Store raw, then parse
const rawPath = await crawler.download(url, 'temp/raw/');
const data = await parser.parse(rawPath);
await loader.upsert(data);
// Keep rawPath for 7 days for reprocessing
```

### Pattern 2: Checkpoint-Based Resumption

**What:** Track progress at each stage. On failure, resume from last successful checkpoint instead of restarting.

**When to use:** Multi-step pipelines where any step can fail (network, parsing, database).

**Trade-offs:**
- ✅ Faster recovery from failures
- ✅ Reduces load on source system (don't re-download)
- ✅ Enables incremental processing
- ❌ Requires state management (database or filesystem)

**Example:**
```typescript
interface JobState {
  jobId: string;
  stage: 'crawl' | 'parse' | 'transform' | 'load';
  filesDownloaded: string[];
  recordsProcessed: number;
  lastCheckpoint: Date;
}

async function runPipeline(jobId: string) {
  const state = await loadState(jobId) || createInitialState(jobId);

  if (state.stage === 'crawl') {
    await crawler.run(state);
    state.stage = 'parse';
    await saveState(state);
  }

  if (state.stage === 'parse') {
    await parser.run(state);
    state.stage = 'transform';
    await saveState(state);
  }

  // ... continue through stages
}
```

### Pattern 3: Idempotent Loads

**What:** Use upserts with unique keys so running the same load multiple times produces the same result.

**When to use:** Always for database writes in ETL. Critical for retry logic.

**Trade-offs:**
- ✅ Safe to retry without data duplication
- ✅ Simplifies error recovery (just re-run)
- ✅ Enables incremental updates
- ❌ Requires careful key design (what makes a record unique?)

**Example:**
```typescript
// Bad: INSERT can create duplicates on retry
await db.query('INSERT INTO propostas VALUES (?, ?, ?)', [id, data, timestamp]);

// Good: UPSERT is idempotent
await db.query(`
  INSERT INTO propostas (id, data, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET
    data = EXCLUDED.data,
    updated_at = EXCLUDED.updated_at
`, [id, data, timestamp]);
```

### Pattern 4: Content Hash Deduplication

**What:** Generate hash of content (not just ID) to detect true duplicates even with different IDs.

**When to use:** When same entity can appear multiple times with different identifiers.

**Trade-offs:**
- ✅ Prevents duplicate records from same content
- ✅ Catches data quality issues
- ✅ Reduces database bloat
- ❌ Hash computation adds overhead
- ❌ Requires careful selection of fields to hash

**Example:**
```typescript
import { createHash } from 'crypto';

function generateContentHash(proposal: Proposal): string {
  // Hash semantic content, not metadata
  const content = `${proposal.titulo}|${proposal.valor}|${proposal.parlamentar}`;
  return createHash('sha256').update(content).digest('hex');
}

async function loadWithDedup(proposals: Proposal[]) {
  for (const p of proposals) {
    const hash = generateContentHash(p);
    const existing = await db.findByHash(hash);

    if (existing) {
      logger.warn('Duplicate detected', { id: p.id, existingId: existing.id });
      continue; // Skip duplicate
    }

    await db.insert({ ...p, content_hash: hash });
  }
}
```

### Pattern 5: Async Job Queue with Retry

**What:** Decouple scheduler from execution using a job queue with exponential backoff retry.

**When to use:** For systems with multiple scheduled jobs or unpredictable execution times.

**Trade-offs:**
- ✅ Prevents queue clog (jobs don't block scheduler)
- ✅ Automatic retry with backoff
- ✅ Enables parallel execution
- ❌ More infrastructure complexity (Redis/database for queue)
- ❌ Harder to debug (async execution)

**Example:**
```typescript
// Simple approach for low-frequency jobs (your use case)
// Just use cron with database-backed state
cron.schedule('0 9 * * *', async () => {
  const jobId = generateJobId();
  try {
    await runPipeline(jobId);
  } catch (error) {
    await alerter.send(`Job ${jobId} failed: ${error.message}`);
    // Retry logic can be added here if needed
  }
});

// Advanced: Full job queue (overkill for 1 job/day)
import Bull from 'bull';
const queue = new Bull('scraping', redisConfig);

queue.process(async (job) => {
  await runPipeline(job.data.jobId);
});

queue.on('failed', (job, err) => {
  alerter.send(`Job ${job.id} failed: ${err.message}`);
});

cron.schedule('0 9 * * *', () => {
  queue.add({ jobId: generateJobId() }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 }
  });
});
```

## Data Flow

### Request Flow

```
[Scheduler Trigger 9am]
    ↓
[Orchestrator] → Create Job ID → Save initial state
    ↓
[Crawler]
  → Playwright.launch()
  → Navigate to login page
  → Enter credentials
  → Save session cookies
  → Navigate to download page
  → Download 4 files to temp/raw/{jobId}/
  → Update state: crawl complete
    ↓
[Parser]
  → Read temp/raw/{jobId}/file1.xlsx
  → Extract rows to Proposta[]
  → Read temp/raw/{jobId}/file2.csv
  → Extract rows to Apoiador[]
  → ... (files 3, 4)
  → Update state: parse complete
    ↓
[Transformer]
  → Validate data quality (required fields, types)
  → Establish relationships (proposta_id → apoiador_id)
  → Generate content hashes
  → Detect duplicates
  → Normalize formats (dates, currency)
  → Update state: transform complete
    ↓
[Loader]
  → BEGIN TRANSACTION
  → Upsert propostas (ON CONFLICT DO UPDATE)
  → Upsert apoiadores
  → Upsert emendas
  → Upsert programas
  → Insert relationships
  → COMMIT
  → Update state: load complete
    ↓
[Monitor]
  → Log metrics (duration, record counts, errors)
  → Send Telegram success notification
  → Clean up temp files (optional: keep for 7 days)
```

### Error Flow

```
[Any Component Failure]
    ↓
[Orchestrator catches exception]
    ↓
[Logger] → Write structured error log
    ↓
[Alerter] → Send Telegram alert with:
  - Job ID
  - Failed stage
  - Error message
  - Stack trace
    ↓
[State Manager] → Preserve state for manual retry
    ↓
[Optional: Automatic Retry]
  → Wait exponential backoff
  → Resume from last checkpoint
  → Max 3 retries before giving up
```

### State Management Flow

```
[Job State Table]
    ↓ (read at start)
[Each Component]
    ↓ (write after completion)
[Job State Table]
    ↓ (read on resume)
[Component Resume Logic]

Schema:
CREATE TABLE job_state (
  job_id UUID PRIMARY KEY,
  stage VARCHAR(20), -- 'crawl' | 'parse' | 'transform' | 'load'
  status VARCHAR(20), -- 'pending' | 'running' | 'completed' | 'failed'
  files_downloaded JSONB,
  records_processed INTEGER,
  error_message TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-100 proposals/day** | Monolith is fine. Single process with cron. Everything in one Node.js app. |
| **100-1,000 proposals/day** | Separate crawler from transformer. Run parser/transformer in parallel threads. Add connection pooling. |
| **1,000+ proposals/day** | Microservices. Crawler → message queue → multiple parser workers. Dedicated database read replicas. |

### Scaling Priorities for Transfer Gov (11 proposals/day)

**Your scale: ~11 proposals/day = tiny. Don't over-engineer.**

1. **First bottleneck (unlikely):** Database writes. Solution: Use upserts, batch inserts, connection pooling.
2. **Second bottleneck (very unlikely):** Crawler blocked by anti-bot. Solution: Rotate user agents, add random delays, use residential proxies.

**Recommendation:** Start with monolith. All components in one Node.js process. Cron triggers main orchestrator function. Only split into microservices if you add more data sources or need independent scaling.

## Anti-Patterns

### Anti-Pattern 1: Parse and Discard Raw Files

**What people do:** Download → parse → save to DB → delete raw file immediately.

**Why it's wrong:**
- Website changes layout → parser breaks → can't reprocess historical data
- Parser bug discovered → need to re-download (expensive, suspicious)
- Compliance/audit requires proof of original data

**Do this instead:**
- Keep raw files for at least 7-30 days
- Store in temp/ with cleanup cron
- For compliance: permanent S3/object storage

### Anti-Pattern 2: Synchronous Pipeline (No Checkpoints)

**What people do:** `crawl() -> parse() -> transform() -> load()` in one try-catch. Failure at any step restarts everything.

**Why it's wrong:**
- Network hiccup during load → re-download everything
- Database deadlock → re-crawl (unnecessary load on source)
- Wastes time and resources

**Do this instead:**
- Save state after each stage
- Resume from last successful checkpoint
- Example: If load fails, just re-run load with existing parsed data

### Anti-Pattern 3: INSERT Without Deduplication

**What people do:**
```typescript
for (const item of items) {
  await db.query('INSERT INTO table VALUES (?)', [item]);
}
```

**Why it's wrong:**
- Re-running creates duplicates
- Hard to clean up
- Data quality degrades over time

**Do this instead:**
- Use UPSERT with unique constraints
- Add content hashing for true duplicates
- Implement database-level uniqueness

### Anti-Pattern 4: Silent Failures

**What people do:** Catch errors but don't alert. Check logs days later and discover pipeline has been broken.

**Why it's wrong:**
- Data becomes stale
- Stakeholders make decisions on old data
- Hard to debug after the fact

**Do this instead:**
- Alert on every failure (Telegram, email, PagerDuty)
- Include job ID, stage, error message in alert
- Set up success notifications too (daily "pipeline healthy" message)

### Anti-Pattern 5: Hardcoded Configuration

**What people do:**
```typescript
const DB_HOST = 'localhost';
const LOGIN_URL = 'https://transferegov.com.br/login';
```

**Why it's wrong:**
- Can't deploy to different environments
- Secrets leak into git
- Hard to test with different configurations

**Do this instead:**
- Environment variables for all config
- Separate .env files for dev/staging/prod
- Use secrets management (AWS Secrets Manager, Railway env vars)

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Transfer Gov Website | Playwright browser automation | Login → navigate → download. Handle session timeout. |
| PostgreSQL | Connection pool via `pg` | Use transactions for atomicity. Connection limit: 20 |
| Telegram Bot API | HTTP POST with retries | For alerts. Batch notifications to avoid rate limits. |
| Railway/Oracle Cloud | Environment variables | Deploy as Docker container. Set DATABASE_URL, TELEGRAM_TOKEN. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Orchestrator ↔ Crawler | Function call | Pass job ID, return file paths |
| Crawler ↔ Parser | Filesystem | Crawler writes to temp/, parser reads |
| Parser ↔ Transformer | In-memory objects | Pass arrays of typed objects |
| Transformer ↔ Loader | In-memory objects | Pass validated, linked objects |
| All ↔ Monitor | Logger interface | Structured logs (JSON), centralized |
| All ↔ State Manager | Database | Read/write job state via shared table |

## Testing Strategy

### Unit Tests (Fast, Isolated)

**Parser:**
- Given: Raw Excel file fixture
- When: parser.parse(file)
- Then: Returns expected array of objects
- Mock: Nothing (pure function)

**Transformer:**
- Given: Array of parsed objects
- When: transformer.validate(data)
- Then: Returns only valid records
- Mock: Nothing (pure function)

**Loader:**
- Given: Valid objects
- When: loader.upsert(data)
- Then: Database has correct records
- Mock: Database (use in-memory SQLite or testcontainers)

### Integration Tests (Slower, Real Dependencies)

**Crawler + Parser:**
- Given: Test credentials, staging environment
- When: Run full crawl + parse
- Then: Parsed data matches expected schema
- Mock: Nothing (test against real staging site if available)

**Transformer + Loader:**
- Given: Sample parsed data
- When: Run transform + load
- Then: Database contains correct relationships
- Mock: Nothing (use test database)

### End-to-End Tests (Slowest, Full Pipeline)

**Full Pipeline:**
- Given: Scheduled job trigger
- When: Orchestrator runs all components
- Then: Database updated, Telegram sent, state marked complete
- Mock: Use test environment, test Telegram chat

### Suggested Test Coverage

```
src/
├── crawler/
│   ├── auth.test.ts         # Unit: Login logic
│   ├── navigator.test.ts    # Unit: Page navigation
│   └── integration.test.ts  # Integration: Full crawl
├── parser/
│   ├── excel-parser.test.ts # Unit: Excel → objects
│   └── csv-parser.test.ts   # Unit: CSV → objects
├── transformer/
│   ├── validator.test.ts    # Unit: Validation rules
│   ├── linker.test.ts       # Unit: Relationship logic
│   └── deduplicator.test.ts # Unit: Hash generation
├── loader/
│   ├── upsert.test.ts       # Integration: DB writes
│   └── transaction.test.ts  # Integration: Atomic ops
└── orchestrator/
    ├── pipeline.test.ts     # Integration: Stage coordination
    └── e2e.test.ts          # E2E: Full job execution
```

## Suggested Build Order

### Phase 1: Foundation (Must build first)

1. **Project setup** - TypeScript, dependencies, folder structure
2. **Database schema** - Tables, relationships, indices
3. **Configuration** - Environment variables, secrets management
4. **Logger** - Structured logging to file/console

**Why first:** Everything depends on these. Can't test without DB schema. Can't debug without logging.

### Phase 2: Core Pipeline (Build in order, test each)

5. **Crawler** - Login, navigate, download files
   - Depends on: Config
   - Test: Can download files to temp/
6. **Parser** - Excel/CSV → typed objects
   - Depends on: Nothing (pure functions)
   - Test: Sample files → correct objects
7. **Transformer** - Validate, link, dedupe
   - Depends on: Parser (for types)
   - Test: Sample objects → validated output
8. **Loader** - Upsert to database
   - Depends on: Database schema
   - Test: Objects → DB records

**Why this order:** Data flows crawler → parser → transformer → loader. Each depends on the previous component's output format.

### Phase 3: Orchestration (Ties components together)

9. **State Manager** - Track job progress
   - Depends on: Database
   - Test: Save/load state
10. **Orchestrator** - Run pipeline with checkpoints
    - Depends on: All core components, state manager
    - Test: Full pipeline execution

**Why now:** Can't orchestrate until individual components work. State management enables error recovery.

### Phase 4: Observability (Production readiness)

11. **Monitor** - Metrics, success rates
    - Depends on: Logger
    - Test: Metrics are recorded
12. **Alerter** - Telegram notifications
    - Depends on: Config (Telegram token)
    - Test: Alert sent on failure

**Why last:** Components work without monitoring. Add observability before deploying to production.

### Phase 5: Deployment (Production launch)

13. **Scheduler** - Cron job trigger
    - Depends on: Orchestrator
    - Test: Job runs at 9am
14. **Docker** - Containerization
    - Depends on: Everything
    - Test: Container runs pipeline
15. **Deploy** - Railway/Oracle setup
    - Depends on: Docker
    - Test: Production job completes

**Why last:** Can test everything locally before deploying. Deployment is just packaging.

### Parallel Tracks (Can build simultaneously)

- **Parser** and **Database schema** can be built in parallel (different people)
- **Monitor** and **Alerter** can be built in parallel
- **Unit tests** alongside each component

### Minimal Viable Pipeline (MVP)

If you need something working ASAP, build this subset first:

1. Crawler (no auth recovery, just basic login)
2. Parser (basic parsing, no error handling)
3. Loader (basic INSERT, no upserts)
4. Orchestrator (run all 3, no checkpoints)
5. Scheduler (simple cron)

Then iterate to add:
- Error handling & checkpoints
- Deduplication & validation
- Monitoring & alerts

## Component Interface Contracts

### Crawler → Parser

**Output:** List of file paths
```typescript
interface CrawlResult {
  jobId: string;
  files: {
    propostas: string;    // Path: temp/raw/{jobId}/propostas.xlsx
    apoiadores: string;   // Path: temp/raw/{jobId}/apoiadores.csv
    emendas: string;
    programas: string;
  };
  downloadedAt: Date;
}
```

### Parser → Transformer

**Output:** Typed objects
```typescript
interface ParseResult {
  propostas: Proposta[];
  apoiadores: Apoiador[];
  emendas: Emenda[];
  programas: Programa[];
}

interface Proposta {
  id_externo: string;     // From source system
  titulo: string;
  valor: number;
  parlamentar: string;
  data_apresentacao: Date;
}
```

### Transformer → Loader

**Output:** Validated, linked objects
```typescript
interface TransformResult {
  propostas: ValidatedProposta[];    // Has content_hash
  apoiadores: ValidatedApoiador[];
  relationships: PropostaApoiador[]; // Junction table records
  stats: {
    duplicatesRemoved: number;
    invalidRecordsSkipped: number;
  };
}
```

### All Components → Monitor

**Output:** Structured log events
```typescript
interface LogEvent {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  component: string;      // 'crawler' | 'parser' | 'transformer' | 'loader'
  jobId: string;
  message: string;
  metadata?: Record<string, any>;
}
```

## Deployment Model Recommendations

### For Transfer Gov (Low Volume, Daily Job)

**Recommended: Single Container on Railway/Oracle Free Tier**

```
One Node.js process:
- Runs cron internally (node-cron)
- Executes all components sequentially
- Connects to managed PostgreSQL
- Sends Telegram alerts
- Lightweight: ~512MB RAM, 0.5 vCPU sufficient
```

**Why:**
- Simple: One deploy, one log stream, one process to monitor
- Cheap: Fits in free tier
- Sufficient: 11 proposals/day doesn't need distribution
- Easy to debug: Everything in one place

### When to Upgrade Architecture

**Multi-Container (Docker Compose)** - When:
- Adding more data sources (need parallel scraping)
- Different schedules for different sources
- Want to scale components independently

**Serverless (AWS Lambda/Cloud Functions)** - When:
- Very intermittent (not daily)
- Need automatic scaling (traffic spikes)
- Want zero cost when idle

**Microservices (Kubernetes)** - When:
- 1000+ proposals/day
- Multiple teams working on different components
- Need independent deployment of services

**Your case: Stick with single container.** Don't over-engineer for scale you won't hit.

## Sources

**ETL Architecture & Patterns:**
- [ETL Frameworks in 2026 for Future-Proof Data Pipelines | Integrate.io](https://www.integrate.io/blog/etl-frameworks-in-2025-designing-robust-future-proof-data-pipelines/)
- [Building an ETL Pipeline for Web Scraping Using Python - DEV Community](https://dev.to/techwithqasim/building-an-etl-pipeline-for-web-scraping-using-python-2381)
- [ETL Architecture and Design: Essential Steps and Patterns for Modern Data Pipelines | Matillion](https://www.matillion.com/blog/etl-architecture-design-patterns-modern-data-pipelines)
- [Data pipeline architecture—Principles, patterns, and key considerations | Redpanda](https://www.redpanda.com/guides/fundamentals-of-data-engineering-data-pipeline-architecture)

**Web Scraping Infrastructure:**
- [State of Web Scraping 2026: Trends, Challenges & What's Next | Browserless](https://www.browserless.io/blog/state-of-web-scraping-2026)
- [Web Scraping Infrastructure That Doesn't Break Under Pressure | GroupBWT](https://groupbwt.com/blog/infrastructure-of-web-scraping/)
- [Web Scraping in Data Science: Architecture & ML Pipelines | GroupBWT](https://groupbwt.com/blog/web-scraping-in-data-science/)
- [Architecture overview — Scrapy 2.14.1 documentation](https://docs.scrapy.org/en/latest/topics/architecture.html)

**Error Handling & Monitoring:**
- [ETL Error Handling and Monitoring Metrics — 25 Statistics Every Data Leader Should Know in 2026 | Integrate.io](https://www.integrate.io/blog/etl-error-handling-and-monitoring-metrics/)
- [Building a Production Ready Observability Stack: The Complete 2026 Guide | Medium](https://medium.com/@krishnafattepurkar/building-a-production-ready-observability-stack-the-complete-2026-guide-9ec6e7e06da2)
- [How to Implement ETL Pipeline Design | OneUptime](https://oneuptime.com/blog/post/2026-01-30-etl-pipeline-design/view)

**State Management & Idempotency:**
- [Understanding Idempotency: A Key to Reliable and Scalable Data Pipelines | Airbyte](https://airbyte.com/data-engineering-resources/idempotency-in-data-pipelines)
- [How to make your data pipeline idempotent | Medium](https://medium.com/@iamanjlikaur/ensuring-idempotency-in-data-ingestion-pipelines-33301cf917fb)
- [Data Deduplication and Canonicalization in Scraped Knowledge Graphs | ScrapingAnt](https://scrapingant.com/blog/data-deduplication-and-canonicalization-in-scraped)
- [How to Store and Manage Scraped Data Efficiently | Round Proxies](https://roundproxies.com/blog/store-scraped-data/)

**Playwright & Browser Automation:**
- [Building a Production-Grade Scraper with Playwright, Chromium, Kubernetes, and AWS - DEV Community](https://dev.to/nirberko/building-a-production-grade-scraper-with-playwright-chromium-kubernetes-and-aws-lo9)
- [Web Scraping with Playwright [2026] | BrowserStack](https://www.browserstack.com/guide/playwright-web-scraping)

**Testing Strategies:**
- [ETL Testing Fundamentals | Integrate.io](https://www.integrate.io/blog/etl-testing-fundamentals/)
- [The Basics of ETL Testing | Matillion](https://www.matillion.com/blog/what-are-the-basics-of-etl-testing)
- [Testing Data Pipelines: Everything You Need to Know in 2024 | Atlan](https://atlan.com/testing-data-pipelines/)

**Component Separation:**
- [Best Web Scraping Tools in 2026 | Scrapfly](https://scrapfly.io/blog/posts/best-web-scraping-tools-in-2026)
- [Why Most Enterprise Data Pipelines Break and How to Fix It | Forage AI](https://forage.ai/blog/enterprise-data-extraction-pipelines-break-and-how-to-fix-it/)

**Deployment Architecture:**
- [Monolithic vs Microservices vs Serverless Architecture | Zignuts](https://www.zignuts.com/blog/monolithic-vs-microservices-vs-serverless-architecture)
- [Monoliths vs Microservices vs Serverless | Harness](https://www.harness.io/blog/monoliths-vs-microservices-vs-serverless)

---
*Architecture research for: Transfer Gov Web Scraping/ETL System*
*Researched: 2026-02-04*
*Confidence: HIGH - Based on current 2026 production practices, official documentation, and verified sources*
