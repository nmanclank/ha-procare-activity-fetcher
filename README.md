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
*   **Timeline Card:** An optional Lovelace card that renders the activity feed as a timeline, with an expandable photo/video viewer, day grouping and type filters. See [Timeline Card](#timeline-card).

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

## Timeline Card

An optional Lovelace card that renders the `activities` attribute as a timeline, with a
full-screen media viewer, day grouping and type filtering.

### Card installation

The card is not distributed through HACS — copy it in manually:

1.  Copy `www/community/procare-timeline-card/procare-timeline-card.js` from this
    repository into your Home Assistant `config/www/community/procare-timeline-card/`
    folder.
2.  Go to **Settings > Dashboards > ... (three dots) > Resources**, click
    **Add Resource**, and register it as a **JavaScript module**:

    ```
    /local/community/procare-timeline-card/procare-timeline-card.js
    ```

3.  Hard-refresh your browser, then add **Procare Timeline Card** from the card picker.

The card has no external dependencies and makes no network requests of its own, so it
works on installs with no outbound internet access.

### Card options

Every option is optional except `entity`. All of them are also editable from the card's
visual editor.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | **required** | The `sensor.<child_name>_latest_activity` entity to display. |
| `header` | string | `Procare Activities` | Card title. Set to `""` to hide the header entirely. |
| `number_of_events` | number | `10` | How many of the most recent events to show. `0` means all of them. |
| `date_format` | string | `monthddyy` | One of `monthddyy`, `short`, `long`, `date`, `time`. |
| `relative_time` | boolean | `true` | Show `2h ago` for events from the last 24 hours, falling back to `date_format` for older ones. |
| `group_by_day` | boolean | `true` | Group events under sticky **Today** / **Yesterday** / date headers. |
| `collapsible_days` | boolean | `false` | Make the day headers tappable to collapse. Older days start collapsed. Requires `group_by_day`. |
| `show_more` | boolean | `true` | Show a **Show N more** button when the feed is longer than `number_of_events`. |
| `compact` | boolean | `false` | Tighter rows and thumbnail-sized media, for narrow dashboard columns. |
| `show_staff` | boolean | `true` | Show the `by <staff>` attribution on each event. |
| `filter_chips` | boolean | `false` | Add a row of chips at the top for filtering by type without editing the config. |
| `hide_types` | list | `[]` | Activity types to leave out completely. Valid keys: `signin`, `signout`, `bottle`, `meal`, `nap`, `diaper`, `potty`, `health`, `incident`, `meds`, `learning`, `note`, `video`, `photo`, `other`. |

Minimal configuration:

```yaml
type: custom:procare-timeline-card
entity: sensor.jane_doe_latest_activity
```

A fuller example — every day collapsible, filter chips on, and the whole week's feed:

```yaml
type: custom:procare-timeline-card
entity: sensor.jane_doe_latest_activity
header: Jane's Day
number_of_events: 0
group_by_day: true
collapsible_days: true
filter_chips: true
relative_time: true
hide_types:
  - signin
  - signout
```

### Media viewer

Photos and videos are tappable. Videos show a play button and a **Video** badge, and the
video file is not fetched until you open it.

Opening any of them brings up a full-screen viewer that steps through **all** the media
in the feed:

*   **←** / **→**, the on-screen arrows, or a horizontal swipe move between items.
*   **Esc** or the close button dismisses it.
*   Videos get native playback controls plus a fullscreen button, and stop playing when
    the viewer closes.

### Notes

*   The older option names `title` and `max_events` are still accepted as aliases for
    `header` and `number_of_events`.
*   Activity types are inferred from each activity's `title`, since the integration does
    not expose a separate type field.
*   The card sizes itself from its container rather than the viewport, so it lays out
    correctly on phones, tablets, desktop, and in narrow dashboard columns alike.

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request.
