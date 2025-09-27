Procare Activities Integration for Home Assistant
This is a custom integration for Home Assistant to display the latest activities from the Procare Connect platform.

Features
Fetches daily activities from the Procare Connect API.

Creates a sensor for the most recent activity.

Stores all of today's activities in the sensor's attributes.
------------------------------------------------------------------------------------------------------------------

Installation
HACS - (Recommended)
Add this repository as a custom repository in HACS.

Search for "Procare Activities" and install it.

Restart Home Assistant.
------------------------------------------------------------------------------------------------------------------

Manual Installation


Copy the procare_activities directory into your custom_components folder.

Restart Home Assistant.
------------------------------------------------------------------------------------------------------------------

Configuration


Go to Settings > Devices & Services.

Click Add Integration and search for Procare Activities.

Enter your Procare Connect username and password.

If you have more than one child, you will be prompted to select one.