"""Shared base class for account-level Procare entities."""
import logging

from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, MANUFACTURER

_LOGGER = logging.getLogger(__name__)

DEFAULT_ACCOUNT_NAME = "Procare Account"


def _dict(value) -> dict:
    """Return value when it is a dict, otherwise an empty dict."""
    return value if isinstance(value, dict) else {}


def user_section(coordinator, section: str) -> dict:
    """Return one section of the parsed user info, always a dict.

    Guards every hop: coordinator.data may be None before the first refresh, and
    an upstream shape change could put a non-dict anywhere along the path.
    """
    user = _dict(_dict(getattr(coordinator, "data", None)).get("user"))
    return _dict(user.get(section))


def account_device_name(coordinator) -> str:
    """Best-effort display name for the account device.

    Device names are fixed when the device is first registered, so this is only
    consulted at setup. Falls back to a generic label when the first refresh
    could not reach the user endpoint.
    """
    name = user_section(coordinator, "school").get("name")
    return name if isinstance(name, str) and name.strip() else DEFAULT_ACCOUNT_NAME


class ProcareAccountEntity(CoordinatorEntity):
    """Base for entities describing the account rather than a single child.

    Scoped to the config entry: a household with several children has one entry
    per child, and each gets its own copy of these entities.
    """

    def __init__(self, coordinator, entry, key: str, name: str, device_name: str):
        """Initialize the account entity."""
        super().__init__(coordinator)
        self._entry_id = entry.entry_id
        self._key = key
        self._device_name = device_name
        self._attr_name = name
        self._attr_unique_id = f"procare_{entry.entry_id}_{key}"

    def _section(self, section: str) -> dict:
        """Return one section of the parsed user info, always a dict."""
        return user_section(self.coordinator, section)

    @property
    def available(self) -> bool:
        """Only available once account info has been fetched at least once."""
        user = _dict(getattr(self.coordinator, "data", None)).get("user")
        return super().available and bool(_dict(user))

    @property
    def device_info(self) -> DeviceInfo:
        """Return the shared account device for this config entry."""
        return {
            "identifiers": {(DOMAIN, f"account_{self._entry_id}")},
            "name": self._device_name,
            "manufacturer": MANUFACTURER,
            "model": "Account",
        }
