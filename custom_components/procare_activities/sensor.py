"""Sensor platform for Procare Activities."""
import logging

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.const import EntityCategory
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.entity import DeviceInfo
from .const import DOMAIN, MANUFACTURER
from .entity import ProcareAccountEntity, account_device_name

_LOGGER = logging.getLogger(__name__)

DEFAULT_CURRENCY = "USD"

async def async_setup_entry(hass, entry, async_add_entities):
    """Set up the sensor platform."""
    # Correctly retrieve the coordinator from the hass.data dictionary
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    kid_name = entry.data["kid_name"]
    kid_id = entry.data["kid_id"]

    device_name = account_device_name(coordinator)

    async_add_entities([
        ProcareActivitySensor(coordinator, kid_name, kid_id),
        ProcareFamilyBalanceSensor(coordinator, entry, device_name),
        ProcareSchoolSensor(coordinator, entry, device_name),
        ProcareCarerSensor(coordinator, entry, device_name),
    ])


def _activities(coordinator) -> list:
    """Return the activity list from the coordinator, tolerating a bad payload."""
    data = coordinator.data if isinstance(coordinator.data, dict) else {}
    activities = data.get("activities")
    return activities if isinstance(activities, list) else []


class ProcareActivitySensor(CoordinatorEntity):
    """Representation of a Procare Activity Sensor."""

    def __init__(self, coordinator, kid_name, kid_id):
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._kid_name = kid_name
        self._kid_id = kid_id
        self._attr_name = f"{kid_name} Latest Activity"
        self._attr_unique_id = f"procare_{kid_id}_latest_activity"
        self._attr_icon = "mdi:child-toy"

    @property
    def state(self):
        """Return the state of the sensor."""
        activities = _activities(self.coordinator)
        if activities:
            return activities[0].get("title", "No Title")
        return "Unknown"

    @property
    def extra_state_attributes(self):
        """Return the state attributes."""
        return {"activities": _activities(self.coordinator)}

    @property
    def device_info(self) -> DeviceInfo:
        """Return device information about this entity."""
        return {
            "identifiers": {(DOMAIN, self._kid_id)},
            "name": self._kid_name,
            "manufacturer": MANUFACTURER,
            "model": "Activity Feed"
        }


class ProcareFamilyBalanceSensor(ProcareAccountEntity, SensorEntity):
    """Outstanding balance on the family's account (positive means owed)."""

    _attr_device_class = SensorDeviceClass.MONETARY
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:cash"

    def __init__(self, coordinator, entry, device_name):
        """Initialize the balance sensor."""
        super().__init__(
            coordinator, entry, "family_balance", "Procare Family Balance", device_name
        )

    @property
    def native_value(self):
        """Return the current balance."""
        return self._section("family").get("current_balance")

    @property
    def native_unit_of_measurement(self):
        """Return the school's billing currency, defaulting to USD."""
        return self._section("school").get("billing_currency") or DEFAULT_CURRENCY


class ProcareSchoolSensor(ProcareAccountEntity, SensorEntity):
    """Static details about the school the child attends."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:school"

    def __init__(self, coordinator, entry, device_name):
        """Initialize the school sensor."""
        super().__init__(coordinator, entry, "school", "Procare School", device_name)

    @property
    def native_value(self):
        """Return the school name."""
        return self._section("school").get("name")

    @property
    def extra_state_attributes(self):
        """Return the school's contact and location details."""
        school = self._section("school")
        return {
            key: school.get(key)
            for key in (
                "street_address",
                "address_line_2",
                "city",
                "state",
                "zip",
                "country",
                "phone",
                "web_url",
                "time_zone",
                "facility_type",
                "enrollment",
            )
        }


class ProcareCarerSensor(ProcareAccountEntity, SensorEntity):
    """The signed-in carer's profile on the account."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_icon = "mdi:account-child"

    def __init__(self, coordinator, entry, device_name):
        """Initialize the carer sensor."""
        super().__init__(coordinator, entry, "carer", "Procare Carer", device_name)

    @property
    def native_value(self):
        """Return the carer's name."""
        return self._section("carer").get("name")

    @property
    def extra_state_attributes(self):
        """Return the carer's relationship and account standing.

        Deliberately excludes the PIN, email and email verification status that
        the API also returns - attributes are readable by any dashboard user and
        are persisted to the recorder database.
        """
        carer = self._section("carer")
        return {
            key: carer.get(key)
            for key in (
                "relation",
                "actual_relation",
                "status",
                "emergency_contact",
                "is_signed_up",
            )
        }
