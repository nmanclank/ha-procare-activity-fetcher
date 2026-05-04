"""API Client for Procare Connect."""
import asyncio
import logging
from datetime import datetime, date, timedelta
import aiohttp

from .const import (
    DEFAULT_AUTH_HOST,
    DEFAULT_API_HOST,
    DEFAULT_WEB_HOST,
)

_LOGGER = logging.getLogger(__name__)



###  Custom errror Handling


"""
TODO: Implement error handing for each event

"""
class ProcareApiError(Exception):
    """ Exception - API errors."""
    pass

class ProcareAuthError(ProcareApiError):
    """ Exception - Auth errors """
    pass

class ProcareNoChildrenError(ProcareApiError):
    """ Exception - No child found """
    pass
###################################################


class ProcareApi:
    def __init__(
        self,
        session: aiohttp.ClientSession,
        username: str,
        password: str,
        school_name: str = None,
    ):
        """API Client Init"""
        self._session = session
        self._username = username
        self._password = password
        self._school_name = school_name

        if school_name:
            # Some Procare instances (e.g. Primrose Schools) use the generic
            # auth endpoint but school-specific API and web hosts. DNS lookups
            # confirm that online-auth.<school>.procareconnect.com does not
            # exist for these providers, while api-school.<school>. and
            # schools.<school>. do. Using the generic auth host works for all
            # known configurations.
            self._auth_host = DEFAULT_AUTH_HOST
            self._api_host = f"https://api-school.{school_name}.procareconnect.com"
            self._web_host = f"https://schools.{school_name}.procareconnect.com"
        else:
            self._auth_host = DEFAULT_AUTH_HOST
            self._api_host = DEFAULT_API_HOST
            self._web_host = DEFAULT_WEB_HOST

        self._headers = {
            "Accept": "application/json, text/plain, */*",
            "Origin": self._web_host,
            "Referer": f"{self._web_host}/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
        }
        self._auth_token = None

    async def async_login(self):
        """ Procare login > get token | ProcareAuthError on failure."""
        if self._auth_token:
            return

        _LOGGER.info("Attempting to log in to Procare auth service")
        
        # Visit the login page to establish a session and get necessary cookies.
        try:
            _LOGGER.debug("Visiting login page to initialize session.")
            async with self._session.get(
                f"{self._web_host}/login", headers=self._headers
            ) as pre_resp:
                pre_resp.raise_for_status()
                _LOGGER.debug("Successfully initialized session.")
        except aiohttp.ClientError as err:
            _LOGGER.warning("Session error on visiting login page: %s", err)

        # Post credentials to the authentication API endpoint.
        payload = {"email": self._username, "password": self._password, "role": "carer", "platform": "web"}
        
        try:
            async with self._session.post(
                f"{self._auth_host}/sessions/", json=payload, headers=self._headers
            ) as resp:
                if resp.status in (401, 403):
                    raise ProcareAuthError(f"Invalid credentials (HTTP {resp.status})")
                if resp.status == 429:
                    raise ProcareApiError("Rate limited by Procare auth service.")
                if resp.status >= 500:
                    raise ProcareApiError(f"Procare auth server error (HTTP {resp.status}).")
                if resp.status not in (200, 201):
                    raise ProcareAuthError(f"Auth failed with status: {resp.status}")

                try:
                    data = await resp.json()
                except (aiohttp.ContentTypeError, ValueError) as err:
                    raise ProcareApiError("Unexpected response format from auth service.") from err

                token = data.get("auth_token")
                
                if not token:
                    raise ProcareAuthError("token not found in login response.")
                
                self._auth_token = token
                _LOGGER.info("Successfully logged in.")
        except (aiohttp.ClientConnectionError, aiohttp.ServerTimeoutError) as err:
            raise ProcareApiError(f"Cannot connect to Procare auth service: {err}") from err
        except asyncio.TimeoutError as err:
            raise ProcareApiError("Request to Procare auth service timed out.") from err

    def _get_auth_headers(self):
        if not self._auth_token:
            raise ProcareAuthError("Not logged in. Token is missing.")
        
        headers = self._headers.copy()
        headers["Authorization"] = f"Bearer {self._auth_token}"
        return headers

    async def _request_with_reauth(self, method: str, url: str, **kwargs) -> dict:
        """Make an authenticated API request, retrying once after re-authentication on 401/403."""
        # Ensure we have a token before the first attempt. async_login() is a
        # no-op when self._auth_token is already set, so this is not wasteful.
        await self.async_login()
        for attempt in range(2):
            try:
                async with self._session.request(
                    method, url, headers=self._get_auth_headers(), **kwargs
                ) as resp:
                    if resp.status in (401, 403) and attempt == 0:
                        _LOGGER.warning("Token expired (HTTP %s), re-authenticating.", resp.status)
                        self._auth_token = None
                        await self.async_login()
                        continue
                    if resp.status in (401, 403):
                        raise ProcareAuthError("Re-authentication failed.")
                    if resp.status == 429:
                        _LOGGER.warning("Rate limited by Procare API (HTTP 429).")
                        raise ProcareApiError("Rate limited by Procare API.")
                    if resp.status >= 500:
                        _LOGGER.warning("Procare server error (HTTP %s).", resp.status)
                        raise ProcareApiError(f"Procare server error (HTTP {resp.status}).")
                    resp.raise_for_status()
                    try:
                        return await resp.json()
                    except (aiohttp.ContentTypeError, ValueError) as err:
                        raise ProcareApiError("Unexpected response format from Procare API.") from err
            except (aiohttp.ClientConnectionError, aiohttp.ServerTimeoutError) as err:
                raise ProcareApiError(f"Cannot connect to Procare API: {err}") from err
            except asyncio.TimeoutError as err:
                raise ProcareApiError("Request to Procare API timed out.") from err
            except aiohttp.ClientResponseError as err:
                raise ProcareApiError(f"Request failed with status {err.status}.") from err

    async def async_get_kids(self) -> list[dict]:
        """Get kids for account."""
        data = await self._request_with_reauth("GET", f"{self._api_host}/api/web/parent/kids/")
        kids = data.get("kids", [])
        if not kids:
            raise ProcareNoChildrenError("No children found for this account.")
        return [{"name": f"{k.get('first_name', '')} {k.get('last_name', '')}".strip(), "id": k.get("id")} for k in kids]

    async def async_get_activities(self, kid_id: str) -> list[dict]:
        """Fetch latest activities for a specific child from the last 7 days."""
        today = date.today()
        seven_days_ago = today - timedelta(days=7)

        params = {
            "kid_id": kid_id,
            "filters[daily_activity][date_from]": seven_days_ago.strftime("%Y-%m-%d"),
            "filters[daily_activity][date_to]": today.strftime("%Y-%m-%d"),
            "page": "1",
        }

        data = await self._request_with_reauth(
            "GET",
            f"{self._api_host}/api/web/parent/daily_activities/",
            params=params,
        )
        return self._parse_activities(data.get("daily_activities", []))

    def _parse_activities(self, raw_activities: list[dict]) -> list[dict]:
        """Parses the raw API activity data into a clean format."""
        parsed = []
        for act in sorted(raw_activities, key=lambda x: x.get("activity_time", ""), reverse=True):
            try:
                activity_type = act.get("activity_type", "unknown").replace("_activity", "")
                title = activity_type.replace("_", " ").title()
                details = act.get("comment", "") or ""
                data = act.get("data", {})

                if activity_type in ("sign_in", "sign_out"):
                    activiable = act.get("activiable", {})
                    signed_by = activiable.get(f"signed_{activity_type}_by", "Unknown")
                    title = f"Signed {activity_type.replace('sign_', '').title()}"
                    details = f"By {signed_by}"
                elif activity_type == "meal" and data:
                    title = f"Meal: {data.get('type', 'Meal')}"
                    details = f"{data.get('desc', '')} ({data.get('quantity', '')})".strip()
                elif activity_type == "nap" and data and data.get('start_time'):
                    start_time = datetime.fromisoformat(data['start_time']).strftime("%-I:%M %p")
                    title = f"Nap Started at {start_time}"
                elif activity_type == "bathroom" and data:
                    title = f"Diaper: {data.get('sub_type', 'check')}"

                parsed.append({
                    "id": act.get("id"),
                    "timestamp": act.get("activity_time"),
                    "title": title.strip(),
                    "details": details.strip(),
                    "photo_url": act.get("photo_url"),
                    "staff": act.get("staff_present_name"),
                })
            except Exception:
                _LOGGER.warning("Could not parse activity record: %s", act, exc_info=True)
        
        return parsed

