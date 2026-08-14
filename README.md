# Procare Activities Integration for Home Assistant

[![hacs_badge](https://img.shields.io/badge/HACS-Default-orange.svg)](https://github.com/hacs/integration)

This is a custom integration for Home Assistant to display the latest activities from the [Procare Connect](https://procareconnect.com/) platform. It creates a sensor that shows the most recent activity for a selected child and stores all of today's activities in the sensor's attributes.

![Activity Sensor Screenshot](assets/image.png)


## Features

*   **Fetches Daily Activities:** Retrieves the latest activities for a selected child from the Procare Connect API.
*   **Real-time Sensor:** Creates a sensor entity in Home Assistant for the most recent activity. The sensor's state is the title of the latest activity (e.g., "Meal: Lunch").
*   **Detailed Attributes:** Stores all activities from the last 7 days in the sensor's attributes, including timestamps, details, photos, videos, and staff member names.
*   **Account Info:** Adds an "Account" device with your family's outstanding balance, unread-message and pending-signature flags, plus school and carer details.
*   **Multi-child Support:** If your account has multiple children, you can select which child to monitor during the configuration process.
*   **Custom School Support:** Supports Procare instances with custom school domains.

## Installation

### HACS (Recommended)

1.  Add this repository as a custom repository in HACS:
    *   Go to HACS > Integrations > ... (three dots in the top right).
    *   Select "Custom repositories".
    *   Paste the URL to this repository (`https://github.com/nmanclank/ha-procare-activities`) in the "Repository" field.
    *   Select "Integration" as the category.
    *   Click "Add".
2.  Search for "Procare Activities" and install it.
3.  Restart Home Assistant.

### Manual Installation

1.  Copy the `procare_activities` directory from this repository into your Home Assistant `custom_components` folder.
2.  Restart Home Assistant.

## Configuration

1.  Go to **Settings > Devices & Services**.
2.  Click **Add Integration** and search for **Procare Activities**.

    ![Add Integration Screenshot](placeholder_for_add_integration.png)

3.  Enter your Procare Connect username and password.
4.  **(Optional)** If your school uses a custom Procare domain (e.g., `myschool.procareconnect.com`), enter the school's unique name (e.g., `myschool`) in the "School Name" field. If you leave this blank, the integration will use the default Procare URLs.

    ![Configuration Screenshot](placeholder_for_configuration.png)

5.  If you have more than one child associated with your account, you will be prompted to select one from a list.

    ![Select Child Screenshot](placeholder_for_select_child.png)

6.  A new sensor will be created for the selected child.

## Sensor Usage

Each config entry creates two devices: one named after the child, and one named after the school.

### Activity sensor (child device)

The integration creates a sensor named `sensor.<child_name>_latest_activity`.

*   **State:** The state of the sensor will be the title of the most recent activity (e.g., "Nap Started at 1:00 PM").
*   **Attributes:** The `activities` attribute contains a list of all activities from the past 7 days. Each activity is a dictionary with the following keys:
    *   `id`: The unique ID of the activity.
    *   `timestamp`: The time the activity occurred (ISO 8601 format).
    *   `title`: A descriptive title for the activity.
    *   `details`: Additional details about the activity.
    *   `photo_url`: A URL to a photo associated with the activity (if available).
    *   `video_url`: A URL to a video associated with the activity (if available).
    *   `is_video`: Whether the attached media is a video.
    *   `staff`: The name of the staff member who recorded the activity.

### Account entities (school device)

These describe the account as a whole rather than a single child.

| Entity | Type | Description |
| --- | --- | --- |
| `sensor.procare_family_balance` | Sensor | The family's current balance, in the school's billing currency. A **positive** value is the amount **owed**. |
| `binary_sensor.procare_unread_messages` | Binary sensor | `on` when there are unread messages from the school. |
| `binary_sensor.procare_signature_requests` | Binary sensor | `on` when the school is waiting on a document signature. |
| `binary_sensor.procare_auto_pay` | Binary sensor | Whether auto-pay is enabled. Diagnostic. |
| `sensor.procare_school` | Sensor | The school's name, with address, phone, timezone, facility type and enrollment as attributes. Diagnostic. |
| `sensor.procare_carer` | Sensor | Your name on the account, with relation, status, emergency-contact and signup state as attributes. Diagnostic. |

A few notes:

*   These entities read from a separate `/api/web/user/` call. If that call fails, they go unavailable but the activity sensor keeps updating normally.
*   A missing field reports as `unknown` rather than `off` or `0`, so automations can tell "nothing waiting" apart from "we couldn't check".
*   Your account PIN, auth token and email address are **never** stored in entity state or attributes, even though the API returns them.
*   Because the integration creates one config entry per child, a household with two children gets **two copies** of these account entities (the second suffixed `_2`). They report the same values; you can safely disable the duplicate set in **Settings > Devices & Services > Entities**.

You can use this data to create automations or display it in your Home Assistant dashboard. For example, to be notified when you owe the daycare money:

```yaml
automation:
  - alias: "Daycare balance due"
    trigger:
      - platform: numeric_state
        entity_id: sensor.procare_family_balance
        above: 0
    action:
      - service: notify.mobile_app
        data:
          message: "Daycare balance is now {{ states('sensor.procare_family_balance') }}"
```

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request.
