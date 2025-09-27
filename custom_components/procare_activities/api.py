"""API Client for Procare Connect."""
import logging
from datetime import datetime, date, timedelta
import aiohttp

_LOGGER = logging.getLogger(__name__)

### Procare hosts 
"""
Web Host   - Used to return auth token
Auth_Host  - Takes auth token and creates a session 
API Host   - Takes authenticated session and serves data (Activities, IDs, etc.)

"""
AUTH_HOST = "https://online-auth.procareconnect.com"
API_HOST = "https://api-school.procareconnect.com"
WEB_HOST = "https://schools.procareconnect.com"

###################################################

###  API endpoints

"""
Defined endpoint using the above hosts.
"""
LOGIN_URL = f"{AUTH_HOST}/sessions/"
KIDS_URL = f"{API_HOST}/api/web/parent/kids/"
WEB_LOGIN_URL = f"{WEB_HOST}/login"
ACTIVITIES_URL = f"{API_HOST}/api/web/parent/daily_activities/"
###################################################



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
    def __init__(self, session: aiohttp.ClientSession, username: str, password: str):
        """API Client Init"""
        self._session = session
        self._username = username
        self._password = password
        self._headers = {
            "Accept": "application/json, text/plain, */*",
            "Origin": WEB_HOST,
            "Referer": f"{WEB_HOST}/",
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
            async with self._session.get(WEB_LOGIN_URL, headers=self._headers) as pre_resp:
                pre_resp.raise_for_status()
                _LOGGER.debug("Successfully initialized session.")
        except aiohttp.ClientError as err:
            _LOGGER.warning("Session error on visiting login page: %s", err)

        # Post credentials to the authentication API endpoint.
        payload = {"email": self._username, "password": self._password, "role": "carer", "platform": "web"}
        
        async with self._session.post(LOGIN_URL, json=payload, headers=self._headers) as resp:
            if resp.status not in (200, 201):
                raise ProcareAuthError(f"Auth failed with status:  {resp.status}")

            data = await resp.json()
            token = data.get("auth_token")
            
            if not token:
                raise ProcareAuthError("token not found in login response.")
            
            self._auth_token = token
            _LOGGER.info("Successfully logged in.")

    def _get_auth_headers(self):
        if not self._auth_token:
            raise ProcareAuthError("Not logged in. Token is missing.")
        
        headers = self._headers.copy()
        headers["Authorization"] = f"Bearer {self._auth_token}"
        return headers

    async def async_get_kids(self) -> list[dict]:
        ''' Get kids for account'''
        await self.async_login()
        async with self._session.get(KIDS_URL, headers=self._get_auth_headers()) as resp:
            resp.raise_for_status()
            data = await resp.json()
            kids = data.get("kids", [])
            if not kids:
                raise ProcareNoChildrenError("No children found for this account.")
            return [{"name": f"{k.get('first_name', '')} {k.get('last_name', '')}".strip(), "id": k.get("id")} for k in kids]

    async def async_get_activities(self, kid_id: str) -> list[dict]:
        """Fetch latest activities for a specific child from the last 7 days."""
        await self.async_login()
        
        today = date.today()
        seven_days_ago = today - timedelta(days=7)
        
        params = {
            "kid_id": kid_id,
            "filters[daily_activity][date_from]": seven_days_ago.strftime("%Y-%m-%d"),
            "filters[daily_activity][date_to]": today.strftime("%Y-%m-%d"),
            "page": "1"
        }
        
        try:
            async with self._session.get(ACTIVITIES_URL, headers=self._get_auth_headers(), params=params) as resp:
                resp.raise_for_status()
                data = await resp.json()
                raw_activities = data.get("daily_activities", [])
                return self._parse_activities(raw_activities)

        except aiohttp.ClientResponseError as err:
            if err.status in (401, 403):
                self._auth_token = None
                raise ProcareAuthError("Token expired, will re-authenticate.") from err
            raise ProcareApiError(f"Failed to fetch activities: {err.status}") from err

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

