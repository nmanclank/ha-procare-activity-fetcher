"""Config flow for Procare Activities."""
import logging
import voluptuous as vol
import aiohttp

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.const import CONF_USERNAME, CONF_PASSWORD

from .const import DOMAIN
from .api import ProcareApi, ProcareAuthError, ProcareNoChildrenError

_LOGGER = logging.getLogger(__name__)

class ProcareConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Procare Activities."""

    VERSION = 1
    CONNECTION_CLASS = config_entries.CONN_CLASS_CLOUD_POLL

    def __init__(self):
        """Initialize the config flow."""
        self._kids = []
        self._user_input = {}

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}
        if user_input is not None:
            self._user_input = user_input
            session = aiohttp.ClientSession()
            api = ProcareApi(session, user_input[CONF_USERNAME], user_input[CONF_PASSWORD])
            
            try:
                await api.async_login()
                self._kids = await api.async_get_kids()
                await session.close()
                return await self.async_step_select_kid()

            except ProcareAuthError:
                errors["base"] = "invalid_auth"
            except ProcareNoChildrenError:
                errors["base"] = "no_children_found"
            except Exception:
                _LOGGER.exception("Unexpected exception")
                errors["base"] = "unknown"
            
            await session.close()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_USERNAME): str,
                vol.Required(CONF_PASSWORD): str,
            }),
            errors=errors,
        )

    async def async_step_select_kid(self, user_input=None):
        """Handle the step to select a child."""

        # I'm so incredibly sleepy >..>  
        if user_input is not None:
            kid_id = user_input["kid"]
            kid_name = next((k["name"] for k in self._kids if k["id"] == kid_id), "Unknown Child")

            await self.async_set_unique_id(kid_id)
            self._abort_if_unique_id_configured()
            
            return self.async_create_entry(
                title=f"{kid_name} Activities",
                data={
                    "username": self._user_input[CONF_USERNAME],
                    "password": self._user_input[CONF_PASSWORD],
                    "kid_id": kid_id,
                    "kid_name": kid_name,
                },
            )

        return self.async_show_form(
            step_id="select_kid",
            data_schema=vol.Schema({
                vol.Required("kid"): vol.In({k["id"]: k["name"] for k in self._kids}),
            }),
        )

