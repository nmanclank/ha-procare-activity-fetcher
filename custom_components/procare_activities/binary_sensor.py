"""Binary sensor platform for Procare Activities."""
import logging

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.const import EntityCategory

from .const import DOMAIN
from .entity import ProcareAccountEntity, account_device_name

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass, entry, async_add_entities):
    """Set up the binary sensor platform."""
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    device_name = account_device_name(coordinator)

    async_add_entities([
        ProcareUnreadMessagesSensor(coordinator, entry, device_name),
        ProcareSignatureRequestsSensor(coordinator, entry, device_name),
        ProcareAutoPaySensor(coordinator, entry, device_name),
    ])


class ProcareAccountFlag(ProcareAccountEntity, BinarySensorEntity):
    """A boolean flag on the account.

    Reports None - and therefore "unknown" - when the underlying field is
    missing, so an API change can never look like a confident "nothing waiting".
    """

    _section_name = ""
    _field = ""

    @property
    def is_on(self):
        """Return the flag's value, or None when it is not present."""
        return self._section(self._section_name).get(self._field)


class ProcareUnreadMessagesSensor(ProcareAccountFlag):
    """Whether the carer has unread messages from the school."""

    _section_name = "carer"
    _field = "unread_messages"

    def __init__(self, coordinator, entry, device_name):
        """Initialize the unread messages sensor."""
        super().__init__(
            coordinator, entry, "unread_messages", "Procare Unread Messages", device_name
        )

    @property
    def icon(self):
        """Return an icon reflecting whether messages are waiting."""
        return "mdi:email-alert" if self.is_on else "mdi:email-outline"


class ProcareSignatureRequestsSensor(ProcareAccountFlag):
    """Whether the school is waiting on a document signature."""

    _section_name = "carer"
    _field = "signature_requests_present"
    _attr_icon = "mdi:file-sign"

    def __init__(self, coordinator, entry, device_name):
        """Initialize the signature requests sensor."""
        super().__init__(
            coordinator,
            entry,
            "signature_requests",
            "Procare Signature Requests",
            device_name,
        )


class ProcareAutoPaySensor(ProcareAccountFlag):
    """Whether auto-pay is enabled for the family."""

    _section_name = "family"
    _field = "auto_pay"
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:cash-sync"

    def __init__(self, coordinator, entry, device_name):
        """Initialize the auto pay sensor."""
        super().__init__(
            coordinator, entry, "auto_pay", "Procare Auto Pay", device_name
        )
