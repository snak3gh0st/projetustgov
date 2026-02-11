"""CLI commands for data enrichment."""

import click
from loguru import logger
import sys

from .enrichment_runner import enrich_missing_contacts, enrich_specific_cnpj


@click.group()
def enrichment():
    """Data enrichment commands."""
    pass


@enrichment.command("contacts")
@click.option(
    "--limit",
    "-l",
    type=int,
    default=None,
    help="Maximum number of proponentes to enrich (default: all)",
)
@click.option(
    "--batch-size",
    "-b",
    type=int,
    default=50,
    help="Number of records per batch (default: 50)",
)
@click.option(
    "--delay",
    "-d",
    type=float,
    default=1.0,
    help="Delay between batches in seconds (default: 1.0)",
)
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
def enrich_contacts(limit, batch_size, delay, verbose):
    """Enrich proponentes missing email/telefone using BrasilAPI.

    Examples:
        # Enrich first 100 records
        python -m src.enrichment.cli contacts --limit 100

        # Enrich all records with smaller batches
        python -m src.enrichment.cli contacts --batch-size 25 --delay 2.0

        # Verbose output
        python -m src.enrichment.cli contacts -v --limit 10
    """
    # Configure logging
    logger.remove()
    log_level = "DEBUG" if verbose else "INFO"
    logger.add(sys.stderr, level=log_level)

    logger.info(
        f"Starting enrichment: limit={limit or 'all'}, "
        f"batch_size={batch_size}, delay={delay}s"
    )

    try:
        stats = enrich_missing_contacts(
            limit=limit, batch_size=batch_size, delay_between_batches=delay
        )

        # Print summary
        click.echo("\n" + "=" * 50)
        click.echo("ENRICHMENT SUMMARY")
        click.echo("=" * 50)
        click.echo(f"Total checked:     {stats['total_checked']}")
        click.echo(f"Enriched:          {stats['enriched']}")
        click.echo(f"Emails added:      {stats['email_added']}")
        click.echo(f"Telefones added:   {stats['telefone_added']}")
        click.echo(f"Already complete:  {stats['already_complete']}")
        click.echo(f"API calls:         {stats['api_calls']}")
        click.echo(f"API errors:        {stats['api_errors']}")
        click.echo("=" * 50)

        if stats["enriched"] > 0:
            click.echo(
                f"\n✓ Successfully enriched {stats['enriched']} proponentes"
            )
        else:
            click.echo("\n✓ No proponentes needed enrichment")

    except Exception as e:
        logger.error(f"Enrichment failed: {e}")
        click.echo(f"\n✗ Error: {e}", err=True)
        sys.exit(1)


@enrichment.command("cnpj")
@click.argument("cnpj")
@click.option("--force", "-f", is_flag=True, help="Force re-enrichment")
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
def enrich_cnpj(cnpj, force, verbose):
    """Enrich a specific proponente by CNPJ.

    Examples:
        # Enrich specific CNPJ
        python -m src.enrichment.cli cnpj 00000000000191

        # Force re-enrichment
        python -m src.enrichment.cli cnpj 00000000000191 --force
    """
    # Configure logging
    logger.remove()
    log_level = "DEBUG" if verbose else "INFO"
    logger.add(sys.stderr, level=log_level)

    click.echo(f"Enriching CNPJ: {cnpj} (force={force})")

    try:
        success = enrich_specific_cnpj(cnpj, force=force)

        if success:
            click.echo(f"\n✓ Successfully enriched {cnpj}")
        else:
            click.echo(f"\n✗ No enrichment performed for {cnpj}")
            sys.exit(1)

    except Exception as e:
        logger.error(f"Enrichment failed: {e}")
        click.echo(f"\n✗ Error: {e}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    enrichment()
