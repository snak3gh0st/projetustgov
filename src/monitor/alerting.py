"""
Alerting module for PROJETUS.

Provides multi-channel alerting via Telegram and email with graceful fallback.
"""

import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional

import httpx


def _get_severity_prefix(severity: str) -> str:
    """Get prefix for alert severity."""
    prefixes = {
        "CRITICAL": "[CRITICAL]",
        "WARNING": "[WARNING]",
        "INFO": "[INFO]",
    }
    return prefixes.get(severity.upper(), "[INFO]")


def _get_config():
    """Try to get config from config loader, fallback to env vars."""
    try:
        from src.config.loader import get_config

        config = get_config()
        return config
    except (ImportError, ModuleNotFoundError):
        return None


def send_telegram_alert(
    subject: str,
    body: str,
    severity: str = "INFO",
) -> bool:
    """
    Send alert to Telegram.

    Args:
        subject: Alert subject/title
        body: Alert message body
        severity: Alert severity level (CRITICAL, WARNING, INFO)

    Returns:
        True if sent successfully, False otherwise
    """
    try:
        # Try to get config from config loader
        config = _get_config()

        if config and hasattr(config, "alerting") and config.alerting.telegram.enabled:
            telegram_config = config.alerting.telegram
            bot_token = telegram_config.bot_token
            chat_id = telegram_config.chat_id
        else:
            # Fallback to environment variables
            bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
            chat_id = os.getenv("TELEGRAM_CHAT_ID")

        if not bot_token or not chat_id:
            return False

        # Format message with severity prefix
        prefix = _get_severity_prefix(severity)
        message = f"{prefix} {subject}\n\n{body}"

        # Send to Telegram API
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown",
        }

        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()

        return True

    except httpx.HTTPError:
        return False
    except Exception:
        return False


def send_email_alert(
    subject: str,
    body: str,
    severity: str = "INFO",
) -> bool:
    """
    Send alert via email using SMTP.

    Args:
        subject: Email subject
        body: Email body
        severity: Alert severity level (CRITICAL, WARNING, INFO)

    Returns:
        True if sent successfully, False otherwise
    """
    try:
        # Try to get config from config loader
        config = _get_config()

        if config and hasattr(config, "alerting") and config.alerting.email.enabled:
            email_config = config.alerting.email
            smtp_host = email_config.smtp_host
            smtp_port = email_config.smtp_port
            from_addr = email_config.from_
            to_addrs = email_config.to
        else:
            # Fallback to environment variables
            smtp_host = os.getenv("EMAIL_SMTP_HOST")
            smtp_port = int(os.getenv("EMAIL_SMTP_PORT", "587"))
            from_addr = os.getenv("EMAIL_FROM", "alerts@projetus.com")
            to_emails = os.getenv("EMAIL_TO", "")
            to_addrs = [e.strip() for e in to_emails.split(",") if e.strip()]

        if not smtp_host or not to_addrs:
            return False

        # Get credentials from environment
        smtp_user = os.getenv("EMAIL_USER")
        smtp_pass = os.getenv("EMAIL_PASS")

        # Format message with severity prefix
        prefix = _get_severity_prefix(severity)
        full_subject = f"{prefix} {subject}"

        # Build email
        msg = MIMEText(body)
        msg["Subject"] = full_subject
        msg["From"] = from_addr
        msg["To"] = ", ".join(to_addrs)

        # Send via SMTP
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            server.starttls()
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.send_message(msg, from_addr, to_addrs)

        return True

    except smtplib.SMTPException:
        return False
    except Exception:
        return False


def send_alert(
    subject: str,
    body: str,
    severity: str = "INFO",
) -> bool:
    """
    Send alert via primary channel (Telegram) with email fallback.

    Args:
        subject: Alert subject/title
        body: Alert message body
        severity: Alert severity level (CRITICAL, WARNING, INFO)

    Returns:
        True if sent via at least one channel, False if all failed
    """
    import sys

    # Try Telegram first
    telegram_sent = send_telegram_alert(subject, body, severity)

    if telegram_sent:
        print(f"Alert sent via Telegram: {subject}")
        return True

    # Telegram failed, try email as fallback
    config = _get_config()
    email_enabled = True

    if config and hasattr(config, "alerting"):
        email_enabled = getattr(config.alerting, "email", None)
        email_enabled = email_enabled.enabled if email_enabled else True
    else:
        # Check environment variable
        email_enabled = os.getenv("EMAIL_SMTP_HOST") is not None

    if email_enabled:
        email_sent = send_email_alert(subject, body, severity)
        if email_sent:
            print(f"Telegram failed, alert sent via email: {subject}")
            return True

    # Both channels failed
    print(f"WARNING: Failed to send alert via any channel: {subject}", file=sys.stderr)
    return False
