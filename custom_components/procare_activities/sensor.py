"""Sensor platform for Procare Activities."""
import logging

from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.helpers.entity import DeviceInfo
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass, entry, async_add_entities):
    """Set up the sensor platform."""
    # Correctly retrieve the coordinator from the hass.data dictionary
    coordinator = hass.data[DOMAIN][entry.entry_id]["coordinator"]
    kid_name = entry.data["kid_name"]
    kid_id = entry.data["kid_id"]
    
    async_add_entities([ProcareActivitySensor(coordinator, kid_name, kid_id)])


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
        if self.coordinator.data:
            return self.coordinator.data[0].get("title", "No Title")
        return "Unknown"

    @property
    def extra_state_attributes(self):
        """Return the state attributes."""
        if not self.coordinator.data:
            return {"activities": []}
            
        return {"activities": self.coordinator.data}

    @property
    def device_info(self) -> DeviceInfo:
        """Return device information about this entity."""
        return {
            "identifiers": {(DOMAIN, self._kid_id)},
            "name": self._kid_name,
            "manufacturer": "Procare Connect",
            "model": "Activity Feed"
        }

