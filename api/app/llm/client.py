import anthropic

TIMEOUT_S = 15.0


def get_client(api_key: str):
    """Claude client, or None when no key is set (the app then runs on rule-based fallbacks)."""
    return anthropic.Anthropic(api_key=api_key, timeout=TIMEOUT_S, max_retries=1) if api_key else None
