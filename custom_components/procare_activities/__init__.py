"""The Procare Activities integration."""
import asyncio
import logging
from datetime import timedelta
import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.exceptions import ConfigEntryAuthFailed

from .const import DOMAIN, PLATFORMS, CONF_SCHOOL_NAME, CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL
from .api import ProcareApi, ProcareApiError, ProcareAuthError

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Procare Activities from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    
    username = entry.data["username"]
    password = entry.data["password"]
    selected_kid_id = entry.data["kid_id"]
    school_name = entry.data.get(CONF_SCHOOL_NAME)

    # Create a single, persistent session for the integration
    session = aiohttp.ClientSession()
    api = ProcareApi(session, username, password, school_name)

    # Last successfully fetched account info, kept across update cycles.
    last_user_info: dict = {}
    user_info_failing = False

    async def async_update_data():
        """Fetch data from API endpoint."""
        nonlocal last_user_info, user_info_failing
        try:
            activities = await api.async_get_activities(selected_kid_id)
        except ProcareAuthError as err:
            raise ConfigEntryAuthFailed from err
        except ProcareApiError as err:
            raise UpdateFailed(f"Error communicating with Procare API: {err}") from err
        except Exception as err:
            raise UpdateFailed(f"Unexpected error: {err}") from err

        # Account-level info is a bonus on top of the activity feed, so a failure
        # here must never take the feed down with it. Carry the previous cycle's
        # data forward so a single blip doesn't flap the account entities to
        # unavailable; only a fetch that has never succeeded yields {}.
        try:
            fetched = await api.async_get_user_info()
            if fetched:
                last_user_info = fetched
                if user_info_failing:
                    _LOGGER.info("Procare account info is available again.")
                    user_info_failing = False
            else:
                _LOGGER.debug("User info response was empty; keeping previous values.")
        except Exception as err:
            # Warn once on the way down, then stay quiet - a permanently removed
            # endpoint shouldn't fill the log with an entry every poll cycle.
            if user_info_failing:
                _LOGGER.debug("Procare account info still unavailable: %s", err)
            else:
                _LOGGER.warning(
                    "Could not fetch Procare account info, the activity feed is "
                    "unaffected: %s", err
                )
                user_info_failing = True

        return {"activities": activities, "user": last_user_info}

    update_interval_minutes = entry.data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL)
    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name="procare_activities_sensor",
        update_method=async_update_data,
        update_interval=timedelta(minutes=update_interval_minutes),
    )
    
    # Fetch initial data so we have it when platforms are set up.
    await coordinator.async_refresh()

    # Store the coordinator and the session together
    hass.data[DOMAIN][entry.entry_id] = {
        "coordinator": coordinator,
        "session": session
    }

    # Use the modern method to forward the setup to all platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Correctly unload all platforms associated with the config entry
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    
    if unload_ok:
        # Properly close the session and remove the entry data
        await hass.data[DOMAIN][entry.entry_id]["session"].close()
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok

