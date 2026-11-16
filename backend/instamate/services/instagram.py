from urllib.parse import urlencode

import httpx

from instamate.config import get_settings


class InstagramAPIError(RuntimeError):
    pass


def _error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
        error = payload.get("error", {})
        if not isinstance(error, dict):
            error = {}
        detail = (
            error.get("error_user_msg")
            or error.get("message")
            or payload.get("error_message")
            or payload.get("message")
            or "The request was rejected."
        )
        return str(detail)[:300]
    except Exception:
        return "Meta returned an unexpected response."


def _data_object(payload: dict) -> dict:
    """Handle a Graph API data wrapper and direct object responses."""
    data = payload.get("data")
    if isinstance(data, dict):
        return data
    return payload


def authorization_url(state: str) -> str:
    """Build the Facebook Login for Business dialog URL for Unified Login."""
    settings = get_settings()
    params = {
        "client_id": settings.meta_app_id,
        "config_id": settings.meta_config_id,
        "redirect_uri": settings.meta_redirect_uri,
        "response_type": "code",
        "display": "popup",
        "prompt": "login",
        "state": state,
    }
    return "https://www.facebook.com/dialog/oauth?" + urlencode(params)


async def exchange_code(code: str) -> dict:
    """Exchange the OAuth code and find the Instagram asset shared via Unified Login."""
    settings = get_settings()
    graph_base = f"https://graph.facebook.com/{settings.graph_api_version}"
    async with httpx.AsyncClient(timeout=25) as client:
        token_response = await client.get(
            f"{graph_base}/oauth/access_token",
            params={
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "code": code,
                "redirect_uri": settings.meta_redirect_uri,
            },
        )
        if token_response.is_error:
            raise InstagramAPIError(_error_message(token_response))
        token_data = _data_object(token_response.json())
        access_token = str(token_data.get("access_token") or "")
        if not access_token:
            raise InstagramAPIError("Meta did not return an access token.")

        auth_header = {"Authorization": f"Bearer {access_token}"}
        business_response = await client.get(
            f"{graph_base}/me",
            params={"fields": "client_business_id"},
            headers=auth_header,
        )
        if business_response.is_error:
            raise InstagramAPIError(_error_message(business_response))
        business = _data_object(business_response.json())
        client_business_id = str(business.get("client_business_id") or "")
        if not client_business_id:
            raise InstagramAPIError("Meta did not return the connected business portfolio ID.")

        accounts_response = await client.get(
            f"{graph_base}/me/assigned_instagram_accounts",
            params={"fields": "id,username"},
            headers=auth_header,
        )
        if accounts_response.is_error:
            raise InstagramAPIError(_error_message(accounts_response))
        accounts = accounts_response.json().get("data", [])
        if not isinstance(accounts, list) or not accounts:
            raise InstagramAPIError("Meta did not share an Instagram professional account with InstaMate.")
        if len(accounts) > 1:
            raise InstagramAPIError(
                "More than one Instagram account was shared. Edit the Meta configuration to select one account, then reconnect."
            )

        account = accounts[0]
        ig_user_id = str(account.get("id") or "")
        if not ig_user_id:
            raise InstagramAPIError("Meta returned an Instagram account without an ID.")


        try:
            expires_in = int(token_data["expires_in"]) if token_data.get("expires_in") is not None else None
        except (TypeError, ValueError):
            expires_in = None

        return {
            "ig_user_id": ig_user_id,
            "username": str(account.get("username") or "Instagram account"),
            "access_token": access_token,
            "expires_in": expires_in,
            "client_business_id": client_business_id,
        }


async def subscribe_to_messages(ig_user_id: str, access_token: str) -> bool:
    """Subscribe the connected Instagram asset to its message webhook field."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            f"https://graph.facebook.com/{settings.graph_api_version}/{ig_user_id}/subscribed_apps",
            params={"subscribed_fields": "messages"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if response.is_error:
        raise InstagramAPIError(_error_message(response))
    return bool(response.json().get("success", True))


async def get_message_sender_username(sender_id: str, access_token: str) -> str | None:
    """Fetch an Instagram username for a person who has messaged this account."""
    settings = get_settings()
    graph_base = f"https://graph.facebook.com/{settings.graph_api_version}"
    async with httpx.AsyncClient(timeout=8) as client:
        response = await client.get(
            f"{graph_base}/{sender_id}",
            params={"fields": "username"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if response.is_error:
        raise InstagramAPIError(_error_message(response))
    payload = _data_object(response.json())
    username = str(payload.get("username") or "").strip().lstrip("@")
    return username or None


async def send_message(ig_user_id: str, recipient_id: str, text: str, access_token: str) -> str:
    """Send a reply through Meta's official Instagram Messaging API."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            f"https://graph.facebook.com/{settings.graph_api_version}/{ig_user_id}/messages",
            json={"recipient": {"id": recipient_id}, "message": {"text": text}},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if response.is_error:
        raise InstagramAPIError(_error_message(response))
    return str(response.json().get("message_id") or "")
