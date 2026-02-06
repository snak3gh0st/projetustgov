"""FastAPI application with health check endpoints for monitoring and Railway integration."""

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import BaseModel

from src.config.loader import get_config
from src.loader.database import get_engine, create_session_factory
from src.loader.extraction_log import get_last_extraction
from src.monitor.scheduler_health import get_scheduler_status
from src.orchestrator.pipeline import run_pipeline

# Module-level scheduler so health checks can inspect it
_scheduler: Optional[BackgroundScheduler] = None


# Pydantic models for response
class HealthResponse(BaseModel):
    """Health check response model."""

    status: str  # healthy, degraded, unhealthy
    last_extraction: Optional[str] = None
    hours_since_last: Optional[float] = None
    records_extracted: Optional[dict] = None
    pipeline_version: Optional[str] = None
    timestamp: str


class ReadyResponse(BaseModel):
    """Readiness check response model."""

    ready: bool
    database: bool
    scheduler: bool
    details: str


class MetricsResponse(BaseModel):
    """Metrics response model (Prometheus-compatible)."""

    total_extractions: int = 0
    successful_extractions: int = 0
    failed_extractions: int = 0
    last_extraction_timestamp: Optional[str] = None
    extraction_success_rate: float = 0.0


class PipelineResponse(BaseModel):
    """Pipeline execution response model."""

    status: str  # success, failed
    message: str
    timestamp: str


def _run_pipeline_job():
    """Wrapper for scheduled pipeline execution with error handling."""
    logger.info("Scheduled pipeline execution starting")
    try:
        run_pipeline()
        logger.info("Scheduled pipeline execution completed successfully")
    except Exception as e:
        logger.error(f"Scheduled pipeline execution failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    global _scheduler

    # Startup
    logger.info("Starting PROJETUS FastAPI application")
    logger.info("Health check endpoints available at /health, /ready, /metrics")

    # Start extraction scheduler
    try:
        config = get_config()
        extraction = config.extraction

        _scheduler = BackgroundScheduler()
        _scheduler.add_job(
            _run_pipeline_job,
            trigger=CronTrigger(
                hour=extraction.hour,
                minute=extraction.minute,
                timezone=extraction.timezone,
            ),
            id="daily_extraction",
            name="Daily Transfer Gov extraction",
            replace_existing=True,
        )
        _scheduler.start()
        logger.info(
            f"Scheduler started: daily extraction at {extraction.hour:02d}:{extraction.minute:02d} "
            f"({extraction.timezone})"
        )
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

    yield

    # Shutdown
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down")
    logger.info("Shutting down PROJETUS FastAPI application")


# Create FastAPI app
app = FastAPI(
    title="PROJETUS API",
    description="Transfer Gov Automation - Health Check Endpoints",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware for Railway health checks
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring systems.

    Returns the current health status of the pipeline based on
    the last extraction timestamp and scheduler status.

    Returns:
        HealthResponse with status, last_extraction time, hours since last,
        records extracted, and pipeline version.
    """
    logger.debug("Health check requested")

    # Get database session
    last_extraction = None

    try:
        engine = get_engine()
        SessionLocal = create_session_factory(engine)
        with SessionLocal() as session:
            last_extraction = get_last_extraction(session)
    except Exception as e:
        logger.error(f"Database connection or config loading failed: {e}")
        return HealthResponse(
            status="unhealthy",
            last_extraction=None,
            hours_since_last=None,
            records_extracted=None,
            pipeline_version=None,
            timestamp=datetime.now().isoformat(),
        )

    # Get scheduler status
    scheduler_status = get_scheduler_status()

    # Calculate hours since last extraction
    hours_since_last = None
    last_extraction_time = None
    records_extracted = None
    pipeline_version = None

    if last_extraction:
        last_extraction_time = last_extraction.run_date.isoformat()
        hours_since = (datetime.now() - last_extraction.run_date).total_seconds() / 3600
        hours_since_last = round(hours_since, 1)

        # Extract records count from extraction log
        if last_extraction.total_records:
            records_extracted = {
                "total": last_extraction.total_records,
                "inserted": last_extraction.records_inserted,
                "updated": last_extraction.records_updated,
            }

        # Pipeline version from extraction log
        pipeline_version = getattr(last_extraction, "pipeline_version", None)

    # Determine overall status
    # healthy: last extraction within 25 hours
    # degraded: last extraction between 25-48 hours ago
    # unhealthy: no extraction or more than 48 hours ago

    if not last_extraction:
        status = "unhealthy"
    elif hours_since_last and hours_since_last < 25:
        status = "healthy"
    elif hours_since_last and hours_since_last < 48:
        status = "degraded"
    else:
        status = "unhealthy"

    # Override with scheduler status if degraded
    if scheduler_status["status"] == "degraded" and status == "healthy":
        status = "degraded"

    response = HealthResponse(
        status=status,
        last_extraction=last_extraction_time,
        hours_since_last=hours_since_last,
        records_extracted=records_extracted,
        pipeline_version=pipeline_version,
        timestamp=datetime.now().isoformat(),
    )

    logger.debug(f"Health check completed: status={status}")
    return response


@app.get("/ready", response_model=ReadyResponse, tags=["Health"])
async def readiness_check():
    """Readiness check endpoint for Kubernetes/Railway.

    Returns whether the application is ready to serve traffic.
    Checks database connectivity and scheduler health.

    Returns:
        ReadyResponse with ready status and component health details.
    """
    logger.debug("Readiness check requested")

    # Check database connectivity
    db_ready = False
    try:
        from sqlalchemy import text

        try:
            engine = get_engine()
            SessionLocal = create_session_factory(engine)
            with SessionLocal() as session:
                # Simple query to verify database connection
                session.execute(text("SELECT 1"))
                db_ready = True
        except Exception as e:
            logger.error(f"Database readiness check failed: {e}")
    except Exception as e:
        logger.error(f"Config loading failed during readiness check: {e}")

    # Check scheduler status
    scheduler_status = get_scheduler_status()
    scheduler_ready = scheduler_status["status"] in ["healthy", "degraded"]

    # Overall readiness
    ready = db_ready and scheduler_ready

    details_parts = []
    if db_ready:
        details_parts.append("Database connected")
    else:
        details_parts.append("Database unavailable")

    if scheduler_ready:
        details_parts.append(f"Scheduler: {scheduler_status['status']}")
    else:
        details_parts.append(f"Scheduler: unhealthy")

    response = ReadyResponse(
        ready=ready,
        database=db_ready,
        scheduler=scheduler_ready,
        details="; ".join(details_parts),
    )

    logger.debug(f"Readiness check completed: ready={ready}")
    return response


@app.get("/metrics", response_model=MetricsResponse, tags=["Health"])
async def metrics_endpoint():
    """Metrics endpoint for Prometheus monitoring.

    Returns extraction metrics including counts, success rate,
    and last extraction timestamp.

    Returns:
        MetricsResponse with extraction statistics.
    """
    logger.debug("Metrics requested")

    total_extractions = 0
    successful_extractions = 0
    failed_extractions = 0
    last_extraction_timestamp = None

    try:
        engine = get_engine()
        SessionLocal = create_session_factory(engine)
        with SessionLocal() as session:
            from src.loader.db_models import ExtractionLog

            # Get all extraction logs
            logs = (
                session.query(ExtractionLog)
                .order_by(ExtractionLog.run_date.desc())
                .all()
            )

            total_extractions = len(logs)

            for log in logs:
                if log.status == "success":
                    successful_extractions += 1
                elif log.status == "failed":
                    failed_extractions += 1

            # Get last extraction timestamp
            if logs:
                last_extraction_timestamp = logs[0].run_date.isoformat()

    except Exception as e:
        logger.error(f"Metrics collection failed: {e}")

    # Calculate success rate
    success_rate = 0.0
    if total_extractions > 0:
        success_rate = successful_extractions / total_extractions

    response = MetricsResponse(
        total_extractions=total_extractions,
        successful_extractions=successful_extractions,
        failed_extractions=failed_extractions,
        last_extraction_timestamp=last_extraction_timestamp,
        extraction_success_rate=round(success_rate, 2),
    )

    logger.debug(
        f"Metrics computed: {total_extractions} extractions, "
        f"{success_rate:.1%} success rate"
    )
    return response


@app.post("/run-pipeline", response_model=PipelineResponse, tags=["Pipeline"])
async def run_pipeline_endpoint():
    """Execute the ETL pipeline.

    This endpoint triggers a full ETL pipeline execution:
    - Parses files from data/raw directory
    - Validates data
    - Loads data into database
    - Creates extraction log entry

    Returns:
        PipelineResponse with execution status and message.
    """
    logger.info("Pipeline execution requested via API")
    try:
        # Run pipeline in background thread to avoid blocking
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        executor = ThreadPoolExecutor(max_workers=1)
        loop = asyncio.get_event_loop()
        
        # Run pipeline in executor
        await loop.run_in_executor(executor, run_pipeline, None)
        
        return PipelineResponse(
            status="success",
            message="Pipeline executed successfully",
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline execution failed: {str(e)}"
        )


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with API information."""
    return {
        "name": "PROJETUS API",
        "description": "Transfer Gov Automation - Health Check Endpoints",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "ready": "/ready",
            "metrics": "/metrics",
            "run-pipeline": "/run-pipeline (POST)",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
