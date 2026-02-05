"""PROJETUS CLI - Transfer Gov Automation Command Line Interface."""

import sys
from pathlib import Path
from typing import Optional

import click
from loguru import logger

from src.orchestrator.dry_run import run_dry_run, print_dry_run_report
from src.api.main import app


@click.command()
@click.option(
    "--dry-run",
    is_flag=True,
    help="Run without writing to database (parse and validate only)",
)
@click.option(
    "--config",
    type=click.Path(exists=True),
    default="config.yaml",
    help="Path to configuration file",
)
@click.option("--api", is_flag=False, help="Run the FastAPI server")
@click.option(
    "--verbose",
    "-v",
    count=True,
    help="Increase verbosity (can be used multiple times: -v, -vv, -vvv)",
)
def main(dry_run: bool, config: str, api: bool, verbose: int):
    """PROJETUS - Transfer Gov Automation CLI.

    This command provides utilities for running the PROJETUS ETL pipeline
    in both normal and dry-run modes, as well as starting the API server.

    Examples:
        # Run full pipeline
        python -m src.cli

        # Run in dry-run mode (no database writes)
        python -m src.cli --dry-run

        # Start API server
        python -m src.cli --api
    """
    # Setup logging based on verbosity
    _setup_logging(verbose)

    logger.info("PROJETUS CLI starting")

    if dry_run:
        logger.info("Dry-run mode enabled - no database writes")
        perform_dry_run(config)
    elif api:
        run_api_server()
    else:
        run_pipeline(config)


def _setup_logging(verbosity: int):
    """Configure loguru logging based on verbosity level.

    Args:
        verbosity: Number of -v flags (0-3+)
    """
    # Remove default handler
    logger.remove()

    # Set level based on verbosity
    if verbosity == 0:
        level = "INFO"
    elif verbosity == 1:
        level = "DEBUG"
    elif verbosity == 2:
        level = "TRACE"
    else:
        level = "TRACE"

    # Add handler with format
    logger.add(
        sys.stderr,
        level=level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{message}</cyan>",
    )


def perform_dry_run(config_path: str):
    """Execute dry-run mode to validate extraction without database writes.

    Args:
        config_path: Path to configuration file (not used in dry-run)
    """
    logger.info(f"Dry-run with config: {config_path}")
    logger.info("Running extraction validation without database writes")

    # Run dry-run
    result = run_dry_run()

    # Print report
    print_dry_run_report(result)

    # Exit with error code if there were validation errors
    if result.validation_errors:
        logger.error(f"Dry-run completed with {len(result.validation_errors)} errors")
        sys.exit(1)
    else:
        logger.info("Dry-run completed successfully")
        sys.exit(0)


def run_pipeline(config_path: str):
    """Execute the full ETL pipeline.

    Args:
        config_path: Path to configuration file
    """
    logger.info(f"Starting full pipeline with config: {config_path}")

    try:
        from src.orchestrator import run_pipeline as execute_pipeline

        execute_pipeline(config_path=config_path)
        logger.info("Pipeline completed successfully")
    except ImportError as e:
        logger.error(f"Pipeline module not found: {e}")
        logger.info("Pipeline functionality not yet implemented")
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        raise


def run_api_server():
    """Start the FastAPI server."""
    import uvicorn

    logger.info("Starting PROJETUS FastAPI server")
    logger.info("Server will be available at http://0.0.0.0:8000")
    logger.info("Endpoints: /health, /ready, /metrics")

    try:
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    except KeyboardInterrupt:
        logger.info("Server shutdown requested")
    except Exception as e:
        logger.error(f"Server failed to start: {e}")
        raise


if __name__ == "__main__":
    main()
