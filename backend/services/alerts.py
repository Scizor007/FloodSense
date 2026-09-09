import logging
from typing import Any, Dict, List, Optional

try:
    from backend.config import settings
except ImportError:
    from config import settings

logger = logging.getLogger("floodsense.services.alerts")


def get_twilio_client():
    """Instantiate Twilio Client if credentials are present."""
    sid = settings.TWILIO_ACCOUNT_SID.strip()
    token = settings.TWILIO_AUTH_TOKEN.strip()
    if sid and token:
        try:
            from twilio.rest import Client
            return Client(sid, token)
        except Exception as e:
            logger.error(f"Failed to initialize Twilio client: {e}")
            return None
    return None


def send_sms(to: str, message: str) -> Dict[str, Any]:
    """Send SMS alert using Twilio."""
    client = get_twilio_client()
    if not client:
        logger.info(f"Twilio credentials not configured. SMS to {to} recorded in simulated mode.")
        return {
            "recipient": to,
            "status": "simulated",
            "channel": "sms",
            "message": "Twilio credentials not set in .env; alert recorded in database.",
        }

    from_number = settings.TWILIO_SMS_NUMBER.strip()
    if not from_number:
        return {
            "recipient": to,
            "status": "failed",
            "channel": "sms",
            "error": "TWILIO_SMS_NUMBER not configured.",
        }

    try:
        msg = client.messages.create(
            body=message,
            from_=from_number,
            to=to,
        )
        logger.info(f"SMS successfully sent to {to} (SID: {msg.sid})")
        return {
            "recipient": to,
            "status": "delivered",
            "channel": "sms",
            "sid": msg.sid,
        }
    except Exception as e:
        logger.warning(f"Twilio SMS delivery failed for {to}: {e}")
        return {
            "recipient": to,
            "status": "failed",
            "channel": "sms",
            "error": str(e),
        }


def send_whatsapp(to: str, message: str) -> Dict[str, Any]:
    """Send WhatsApp alert using Twilio Sandbox format."""
    client = get_twilio_client()
    if not client:
        logger.info(f"Twilio credentials not configured. WhatsApp to {to} recorded in simulated mode.")
        return {
            "recipient": to,
            "status": "simulated",
            "channel": "whatsapp",
            "message": "Twilio credentials not set in .env; alert recorded in database.",
        }

    from_number = settings.TWILIO_WHATSAPP_NUMBER.strip()
    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{from_number}"

    to_number = to.strip()
    if not to_number.startswith("whatsapp:"):
        to_number = f"whatsapp:{to_number}"

    try:
        msg = client.messages.create(
            body=message,
            from_=from_number,
            to=to_number,
        )
        logger.info(f"WhatsApp alert sent to {to} (SID: {msg.sid})")
        return {
            "recipient": to,
            "status": "delivered",
            "channel": "whatsapp",
            "sid": msg.sid,
        }
    except Exception as e:
        logger.warning(f"Twilio WhatsApp delivery failed for {to}: {e}")
        return {
            "recipient": to,
            "status": "failed",
            "channel": "whatsapp",
            "error": str(e),
        }


def broadcast_alert(
    channel: str,
    message: str,
    recipients: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Broadcast alert across specified delivery channel."""
    results = []
    recips = recipients or []

    if channel == "app" or not recips:
        return [{"recipient": "in-app-subscribers", "status": "delivered", "channel": "app"}]

    for r in recips:
        if channel == "sms":
            results.append(send_sms(r, message))
        elif channel == "whatsapp":
            results.append(send_whatsapp(r, message))
        else:
            results.append({"recipient": r, "status": "unsupported_channel", "channel": channel})

    return results
