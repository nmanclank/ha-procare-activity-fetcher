// ProcareTimelineCard.js
// A Lovelace card that renders the `activities` attribute of a Procare
// "<child> Latest Activity" sensor as a timeline, with an expandable media
// viewer, optional day grouping and a handful of display options.
//
// No external dependencies: everything below uses plain custom elements plus
// the `ha-card` / `ha-icon` / `ha-form` elements Home Assistant already ships.

const CARD_VERSION = "1.1.0";
const DOCS_URL = "https://github.com/nmanclank/ha-procare-activity-fetcher";

console.info(
  `%c PROCARE-TIMELINE-CARD %c ${CARD_VERSION} `,
  "color:#fff;background:#3f51b5;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px",
  "color:#3f51b5;background:#e8eaf6;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px"
);

// =============================
// Activity types
// =============================
// The integration does not expose an `activity_type` field -- the raw type is
// consumed while building `title` and then discarded (see api.py::_parse_activities).
// So the type has to be inferred from the title text. Order matters: the first
// entry whose `match` list hits wins, so put specific phrases before loose ones.
const TYPE_MAP = [
  { key: "signin", label: "Signed In", icon: "mdi:login", color: "var(--green-color, #43a047)", match: ["signed in", "sign in"] },
  { key: "signout", label: "Signed Out", icon: "mdi:logout", color: "var(--grey-color, #9e9e9e)", match: ["signed out", "sign out"] },
  { key: "bottle", label: "Bottle", icon: "mdi:baby-bottle-outline", color: "var(--cyan-color, #00acc1)", match: ["bottle"] },
  { key: "meal", label: "Meals", icon: "mdi:silverware-fork-knife", color: "var(--orange-color, #ef6c00)", match: ["meal", "snack", "breakfast", "lunch", "dinner"] },
  { key: "nap", label: "Naps", icon: "mdi:power-sleep", color: "var(--indigo-color, #3f51b5)", match: ["nap", "slept", "sleep"] },
  { key: "diaper", label: "Diapers", icon: "mdi:baby-carriage", color: "var(--teal-color, #00897b)", match: ["diaper", "bathroom"] },
  { key: "potty", label: "Potty", icon: "mdi:human-male-female", color: "var(--teal-color, #00897b)", match: ["potty"] },
  { key: "health", label: "Health", icon: "mdi:heart-pulse", color: "var(--red-color, #e53935)", match: ["health"] },
  { key: "incident", label: "Incidents", icon: "mdi:alert-circle-outline", color: "var(--red-color, #e53935)", match: ["incident", "injury"] },
  { key: "meds", label: "Medication", icon: "mdi:pill", color: "var(--pink-color, #d81b60)", match: ["meds", "medication"] },
  { key: "learning", label: "Learning", icon: "mdi:school", color: "var(--purple-color, #8e24aa)", match: ["learning"] },
  { key: "note", label: "Notes", icon: "mdi:note-text-outline", color: "var(--blue-color, #1e88e5)", match: ["note"] },
  { key: "video", label: "Videos", icon: "mdi:video", color: "var(--purple-color, #8e24aa)", match: ["video"] },
  { key: "photo", label: "Photos", icon: "mdi:image-outline", color: "var(--blue-color, #1e88e5)", match: ["photo", "picture", "image"] },
];

const DEFAULT_TYPE = {
  key: "other",
  label: "Other",
  icon: "mdi:child-toy",
  color: "var(--primary-color)",
};

const VIDEO_TYPE = TYPE_MAP.find((t) => t.key === "video");

function hasVideo(activity) {
  return Boolean(activity && (activity.video_url || activity.is_video));
}

function activityType(activity) {
  const title = activity && typeof activity.title === "string" ? activity.title.toLowerCase() : "";
  let type = DEFAULT_TYPE;
  for (const candidate of TYPE_MAP) {
    if (candidate.match.some((needle) => title.includes(needle))) {
      type = candidate;
      break;
    }
  }
  // A "Photo" activity that actually carries a video file should read as a video.
  if (hasVideo(activity) && (type.key === "photo" || type.key === "other")) {
    return VIDEO_TYPE;
  }
  return type;
}

// =============================
// Small helpers
// =============================
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== "") node.textContent = text;
  return node;
}

function icon(name) {
  const node = document.createElement("ha-icon");
  node.setAttribute("icon", name);
  return node;
}

// Only http(s) URLs make it into the DOM -- everything else (javascript:, data:,
// malformed strings) is dropped rather than rendered.
function safeUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch (err) {
    return null;
  }
}

function parseDate(timestamp) {
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  const options = { weekday: "short", month: "long", day: "numeric" };
  if (date.getFullYear() !== today.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}

function relativeTime(date) {
  const diff = Date.now() - date.getTime();
  if (diff < 0 || diff >= 86400000) return null; // fall back to the absolute format
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// =============================
// Config normalisation
// =============================
// `title` / `max_events` are the pre-rename option names (commit 657d8e4) and are
// still accepted so older YAML keeps working.
function normalizeConfig(config) {
  const raw = config || {};
  const events = raw.number_of_events !== undefined ? raw.number_of_events : raw.max_events;
  let limit;
  if (events === undefined || events === null || events === "") {
    limit = 10;
  } else if (events === "all" || Number(events) === 0) {
    limit = Infinity;
  } else {
    limit = Number(events) || 10;
  }

  return {
    entity: raw.entity,
    header: raw.header !== undefined ? raw.header : raw.title !== undefined ? raw.title : "Procare Activities",
    number_of_events: limit,
    date_format: raw.date_format || "monthddyy",
    relative_time: raw.relative_time !== false,
    group_by_day: raw.group_by_day !== false,
    collapsible_days: raw.collapsible_days === true,
    show_more: raw.show_more !== false,
    compact: raw.compact === true,
    show_staff: raw.show_staff !== false,
    filter_chips: raw.filter_chips === true,
    hide_types: Array.isArray(raw.hide_types) ? raw.hide_types : [],
  };
}

// =============================
// Styles
// =============================
const CARD_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  :host {
    container: procare / inline-size;
    display: block;
    --pc-bubble: 40px;
    --pc-gutter-gap: 14px;
    --pc-media-max: 440px;
    --pc-item-gap: 22px;
    --pc-accent: var(--primary-color);
  }
  ha-card {
    overflow: hidden;
  }
  .content {
    padding: 4px 16px 16px 16px;
  }
  ha-card:not([header]) .content {
    padding-top: 16px;
  }

  /* ---- filter chips ---- */
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 16px 12px 16px;
    -webkit-overflow-scrolling: touch;
  }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 17px;
    border: 1px solid var(--divider-color, #e0e0e0);
    background: transparent;
    color: var(--primary-text-color);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.18s ease, border-color 0.18s ease;
  }
  .chip:hover { background: var(--secondary-background-color); }
  .chip[aria-pressed="true"] {
    border-color: var(--pc-chip-color, var(--primary-color));
    background: color-mix(in srgb, var(--pc-chip-color, var(--primary-color)) 16%, transparent);
    color: var(--pc-chip-color, var(--primary-color));
  }
  .chip ha-icon { --mdc-icon-size: 16px; }

  /* ---- day groups ---- */
  .day + .day { margin-top: 8px; }
  .day-header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% + 32px);
    margin: 0 -16px;
    padding: 8px 16px;
    border: 0;
    background: var(--ha-card-background, var(--card-background-color, #fff));
    color: var(--secondary-text-color);
    font: inherit;
    font-size: 0.76rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    text-align: left;
  }
  button.day-header { cursor: pointer; }
  button.day-header:hover { color: var(--primary-text-color); }
  .day-header .count {
    margin-left: auto;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
    opacity: 0.75;
  }
  .day-header .chevron {
    --mdc-icon-size: 18px;
    transition: transform 0.2s ease;
  }
  .day.collapsed .chevron { transform: rotate(-90deg); }
  .day.collapsed .day-items { display: none; }

  /* ---- timeline items ---- */
  .item {
    display: flex;
    gap: var(--pc-gutter-gap);
    position: relative;
  }
  .gutter {
    position: relative;
    flex: 0 0 var(--pc-bubble);
    display: flex;
    justify-content: center;
  }
  .gutter::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    margin-left: -1px;
    background: var(--divider-color, #e0e0e0);
  }
  .item:first-of-type .gutter::before { top: calc(var(--pc-bubble) / 2); }
  .item:last-of-type .gutter::before { bottom: calc(100% - var(--pc-bubble) / 2); }
  .item:first-of-type:last-of-type .gutter::before { display: none; }
  .bubble {
    position: relative;
    z-index: 1;
    width: var(--pc-bubble);
    height: var(--pc-bubble);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--pc-accent);
    background: color-mix(in srgb, var(--pc-accent) 15%, var(--card-background-color, #fff));
    box-shadow: 0 0 0 3px var(--ha-card-background, var(--card-background-color, #fff));
  }
  .bubble ha-icon { --mdc-icon-size: calc(var(--pc-bubble) * 0.55); }

  .body {
    flex: 1 1 auto;
    min-width: 0;
    padding-bottom: var(--pc-item-gap);
  }
  .title {
    font-size: 1.02rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--primary-text-color);
    overflow-wrap: anywhere;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-top: 2px;
    color: var(--secondary-text-color);
    font-size: 0.8rem;
  }
  .meta .sep { opacity: 0.5; }
  .description {
    margin-top: 6px;
    color: var(--primary-text-color);
    font-size: 0.92rem;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* ---- media tiles ---- */
  .media { margin-top: 10px; }
  .tile {
    display: block;
    position: relative;
    width: 100%;
    max-width: var(--pc-media-max);
    aspect-ratio: 4 / 3;
    padding: 0;
    border: 0;
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    background: var(--secondary-background-color, #f1f1f1);
    -webkit-tap-highlight-color: transparent;
  }
  .tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.28s ease;
  }
  .tile:hover img { transform: scale(1.04); }
  .tile:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .tile .scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0) 45%);
    opacity: 0;
    transition: opacity 0.22s ease;
  }
  .tile:hover .scrim, .tile:focus-visible .scrim, .tile.video .scrim { opacity: 1; }
  .tile .badge {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 0.72rem;
    font-weight: 600;
    backdrop-filter: blur(3px);
  }
  .tile .badge.expand { top: 8px; right: 8px; padding: 5px; }
  .tile .badge.kind { left: 8px; bottom: 8px; }
  .tile .badge ha-icon { --mdc-icon-size: 16px; }
  .tile .play {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 58px;
    height: 58px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.92);
    color: #111;
    box-shadow: 0 3px 14px rgba(0, 0, 0, 0.35);
    transition: transform 0.22s ease;
  }
  .tile .play ha-icon { --mdc-icon-size: 34px; margin-left: 3px; }
  .tile:hover .play { transform: translate(-50%, -50%) scale(1.08); }
  .tile .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--secondary-text-color);
    font-size: 0.8rem;
    background: color-mix(in srgb, var(--pc-accent) 10%, var(--secondary-background-color, #f1f1f1));
  }
  .tile .placeholder ha-icon { --mdc-icon-size: 32px; }

  /* ---- show more / empty / footer ---- */
  .more {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 4px;
    padding: 10px 16px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 12px;
    background: transparent;
    color: var(--primary-color);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .more:hover { background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px 16px;
    color: var(--secondary-text-color);
    text-align: center;
  }
  .empty ha-icon { --mdc-icon-size: 40px; opacity: 0.6; }
  .error {
    color: var(--error-color, #db4437);
    padding: 16px;
  }

  /* ---- media viewer ---- */
  dialog.viewer {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    background: transparent;
    color: #fff;
  }
  dialog.viewer::backdrop {
    background: rgba(0, 0, 0, 0.88);
    backdrop-filter: blur(6px);
  }
  .viewer-layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    box-sizing: border-box;
  }
  .viewer-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
  }
  .viewer-bar .counter {
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }
  .viewer-bar .spacer { flex: 1 1 auto; }
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    cursor: pointer;
    transition: background-color 0.18s ease;
  }
  .icon-btn:hover { background: rgba(255, 255, 255, 0.24); }
  .icon-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .icon-btn[hidden] { display: none; }
  .stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 0 8px;
    touch-action: pan-y;
  }
  .stage .frame {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    max-width: 100%;
    max-height: 100%;
  }
  .stage img, .stage video {
    max-width: 100%;
    max-height: 100%;
    border-radius: 10px;
    background: #000;
    object-fit: contain;
  }
  .stage .nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 48px;
    height: 48px;
  }
  .stage .nav.prev { left: 6px; }
  .stage .nav.next { right: 6px; }
  .stage .nav ha-icon { --mdc-icon-size: 30px; }
  .viewer-caption {
    padding: 12px 16px 18px 16px;
    text-align: center;
  }
  .viewer-caption .cap-title { font-weight: 600; }
  .viewer-caption .cap-meta {
    font-size: 0.82rem;
    opacity: 0.75;
    margin-top: 2px;
  }

  /* ---- compact density ---- */
  :host([data-compact]) {
    --pc-bubble: 30px;
    --pc-gutter-gap: 10px;
    --pc-item-gap: 12px;
    --pc-media-max: 132px;
  }
  :host([data-compact]) .title { font-size: 0.94rem; }
  :host([data-compact]) .description { font-size: 0.86rem; margin-top: 3px; }
  :host([data-compact]) .tile { aspect-ratio: 1 / 1; border-radius: 10px; }
  :host([data-compact]) .tile .play { width: 40px; height: 40px; }
  :host([data-compact]) .tile .play ha-icon { --mdc-icon-size: 24px; }
  :host([data-compact]) .tile .badge.kind { display: none; }

  /* ---- container-driven sizing ---- */
  /* Container queries (not media queries) so a card in a narrow desktop column
     gets the same treatment as one on a phone. */
  @container procare (max-width: 380px) {
    :host {
      --pc-bubble: 32px;
      --pc-gutter-gap: 10px;
      --pc-media-max: 100%;
    }
    .content { padding-left: 12px; padding-right: 12px; }
    .day-header { width: calc(100% + 24px); margin: 0 -12px; padding: 8px 12px; }
    .chips { padding-left: 12px; padding-right: 12px; }
    .title { font-size: 0.98rem; }
  }
  @container procare (min-width: 620px) {
    :host {
      --pc-media-max: 520px;
      --pc-item-gap: 26px;
    }
    .title { font-size: 1.08rem; }
    .description { font-size: 0.96rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
    .tile:hover img { transform: none; }
  }
`;

// =============================
// Procare Timeline Card
// =============================
class ProcareTimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._collapsedDays = new Set();
    this._expanded = false;
    this._activeFilter = null;
    this._activities = [];
    this._media = [];
    this._viewerIndex = -1;
    this._signature = null;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("You must define an entity");
    }
    this._config = normalizeConfig(config);
    this._rawConfig = config;
    this._signature = null;
    this._expanded = false;
    this._activeFilter = null;
    this._collapsedDays = new Set();
    this._touchedDays = false;
    if (this._config.compact) {
      this.setAttribute("data-compact", "");
    } else {
      this.removeAttribute("data-compact");
    }
    if (this._hass) this.hass = this._hass;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    const state = hass && hass.states ? hass.states[this._config.entity] : null;
    if (!state) {
      this._signature = null;
      if (!this._errorShown) this.renderError(`Entity not found: ${this._config.entity}`);
      return;
    }
    this._errorShown = false;

    const activities = Array.isArray(state.attributes.activities) ? state.attributes.activities : [];
    const first = activities[0] || {};
    const signature = [
      this._config.entity,
      state.last_changed,
      activities.length,
      first.id,
      first.timestamp,
      JSON.stringify(this._config, (key, value) => (value === Infinity ? "all" : value)),
    ].join("|");

    if (signature === this._signature) return;
    this._signature = signature;
    this._activities = activities;
    this._render();
  }

  connectedCallback() {
    // Relative labels ("2h ago") go stale on their own, so nudge them once a minute.
    this._tick = window.setInterval(() => {
      if (this._config && this._config.relative_time && !this._isViewerOpen()) {
        this._renderBody();
      }
    }, 60000);
  }

  disconnectedCallback() {
    if (this._tick) window.clearInterval(this._tick);
    this._tick = null;
    this._closeViewer();
  }

  // ---------------------------
  // Shell
  // ---------------------------
  _ensureShell() {
    if (this._card) return;
    this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style>`;
    this._card = document.createElement("ha-card");
    this._chips = el("div", "chips");
    this._body = el("div", "content");
    this._card.appendChild(this._chips);
    this._card.appendChild(this._body);
    this.shadowRoot.appendChild(this._card);
    this._buildViewer();
  }

  _render() {
    this._ensureShell();
    // Rebuilding the body would invalidate the gallery index the open viewer is
    // walking, so hold the update until it closes.
    if (this._isViewerOpen()) {
      this._pendingRender = true;
      return;
    }
    // Re-applied on every render so a `header` change actually takes effect.
    if (this._config.header) {
      this._card.setAttribute("header", this._config.header);
    } else {
      this._card.removeAttribute("header");
    }
    this._renderBody();
  }

  // ---------------------------
  // Selection pipeline: hide_types -> chip filter -> limit
  // ---------------------------
  _visibleActivities() {
    const hidden = this._config.hide_types;
    let items = this._activities.filter((activity) => !hidden.includes(activityType(activity).key));

    if (this._activeFilter === "media") {
      items = items.filter((a) => safeUrl(a.photo_url) || safeUrl(a.video_url));
    } else if (this._activeFilter) {
      items = items.filter((a) => activityType(a).key === this._activeFilter);
    }
    return items;
  }

  _renderBody() {
    const all = this._visibleActivities();
    const limit = this._config.number_of_events;
    const shown = this._expanded || limit === Infinity ? all : all.slice(0, limit);
    const remaining = all.length - shown.length;

    this._renderChips();

    this._body.textContent = "";
    this._media = [];

    if (shown.length === 0) {
      const empty = el("div", "empty");
      empty.appendChild(icon("mdi:timeline-text-outline"));
      empty.appendChild(el("div", null, this._activities.length ? "No activities match the current filter." : "No activities to display."));
      this._body.appendChild(empty);
      return;
    }

    if (this._config.group_by_day) {
      this._renderGrouped(shown);
    } else {
      this._body.appendChild(this._buildItemList(shown));
    }

    if (this._config.show_more && remaining > 0) {
      const button = el("button", "more", `Show ${remaining} more`);
      button.type = "button";
      button.addEventListener("click", () => {
        this._expanded = true;
        this._renderBody();
      });
      this._body.appendChild(button);
    } else if (this._expanded && limit !== Infinity && all.length > limit) {
      const button = el("button", "more", "Show less");
      button.type = "button";
      button.addEventListener("click", () => {
        this._expanded = false;
        this._renderBody();
      });
      this._body.appendChild(button);
    }
  }

  _renderChips() {
    this._chips.textContent = "";
    if (!this._config.filter_chips) {
      this._chips.style.display = "none";
      return;
    }
    this._chips.style.display = "";

    const hidden = this._config.hide_types;
    const pool = this._activities.filter((a) => !hidden.includes(activityType(a).key));
    const present = [];
    const seen = new Set();
    for (const activity of pool) {
      const type = activityType(activity);
      if (!seen.has(type.key)) {
        seen.add(type.key);
        present.push(type);
      }
    }

    const options = [{ key: null, label: "All", icon: "mdi:format-list-bulleted", color: "var(--primary-color)" }];
    if (pool.some((a) => safeUrl(a.photo_url) || safeUrl(a.video_url))) {
      options.push({ key: "media", label: "Media", icon: "mdi:image-multiple-outline", color: "var(--primary-color)" });
    }
    options.push(...present);

    for (const option of options) {
      const chip = el("button", "chip");
      chip.type = "button";
      chip.style.setProperty("--pc-chip-color", option.color);
      chip.setAttribute("aria-pressed", String(this._activeFilter === option.key));
      chip.appendChild(icon(option.icon));
      chip.appendChild(el("span", null, option.label));
      chip.addEventListener("click", () => {
        this._activeFilter = this._activeFilter === option.key ? null : option.key;
        this._expanded = false;
        this._renderBody();
      });
      this._chips.appendChild(chip);
    }
  }

  _renderGrouped(activities) {
    const groups = [];
    const index = new Map();
    for (const activity of activities) {
      const date = parseDate(activity.timestamp);
      const key = date ? dayKey(date) : "unknown";
      if (!index.has(key)) {
        const group = { key, label: date ? dayLabel(date) : "Undated", items: [] };
        index.set(key, group);
        groups.push(group);
      }
      index.get(key).items.push(activity);
    }

    groups.forEach((group, position) => {
      const collapsible = this._config.collapsible_days;
      // With collapsing enabled, everything but the newest day starts closed.
      if (collapsible && position > 0 && !this._touchedDays) this._collapsedDays.add(group.key);
      const collapsed = collapsible && this._collapsedDays.has(group.key);

      const section = el("div", collapsed ? "day collapsed" : "day");
      const header = document.createElement(collapsible ? "button" : "div");
      header.className = "day-header";
      if (collapsible) {
        header.type = "button";
        header.setAttribute("aria-expanded", String(!collapsed));
        const chevron = icon("mdi:chevron-down");
        chevron.classList.add("chevron");
        header.appendChild(chevron);
        header.addEventListener("click", () => {
          this._touchedDays = true;
          if (this._collapsedDays.has(group.key)) this._collapsedDays.delete(group.key);
          else this._collapsedDays.add(group.key);
          this._renderBody();
        });
      }
      header.appendChild(el("span", "label", group.label));
      header.appendChild(el("span", "count", `${group.items.length} ${group.items.length === 1 ? "event" : "events"}`));
      section.appendChild(header);

      const list = this._buildItemList(group.items);
      list.classList.add("day-items");
      section.appendChild(list);
      this._body.appendChild(section);
    });

    if (this._config.collapsible_days) this._touchedDays = true;
  }

  _buildItemList(activities) {
    const list = el("div", "items");
    for (const activity of activities) {
      list.appendChild(this._buildItem(activity));
    }
    return list;
  }

  _buildItem(activity) {
    const type = activityType(activity);
    const date = parseDate(activity.timestamp);

    const item = el("div", "item");
    item.style.setProperty("--pc-accent", type.color);

    const gutter = el("div", "gutter");
    const bubble = el("div", "bubble");
    bubble.appendChild(icon(type.icon));
    gutter.appendChild(bubble);
    item.appendChild(gutter);

    const body = el("div", "body");
    body.appendChild(el("div", "title", activity.title || "Activity"));

    const meta = el("div", "meta");
    meta.appendChild(el("span", "when", this._timeLabel(date, activity.timestamp)));
    if (this._config.show_staff && activity.staff) {
      meta.appendChild(el("span", "sep", "·"));
      meta.appendChild(el("span", "staff", `by ${activity.staff}`));
    }
    body.appendChild(meta);

    if (activity.details) {
      body.appendChild(el("div", "description", activity.details));
    }

    const media = this._buildMedia(activity, type, date);
    if (media) body.appendChild(media);

    item.appendChild(body);
    return item;
  }

  _timeLabel(date, rawTimestamp) {
    if (!date) return String(rawTimestamp || "");
    if (this._config.relative_time) {
      const relative = relativeTime(date);
      if (relative) return relative;
    }
    return this.formatDate(date);
  }

  _buildMedia(activity, type, date) {
    const photo = safeUrl(activity.photo_url);
    const video = safeUrl(activity.video_url);
    if (!photo && !video) return null;

    // Register in the gallery index so the viewer can walk photos and videos
    // together, in feed order.
    const entry = {
      photo,
      video,
      isVideo: Boolean(video),
      title: activity.title || (video ? "Video" : "Photo"),
      staff: this._config.show_staff ? activity.staff : null,
      timeText: date ? this.formatDate(date) : "",
    };
    const mediaIndex = this._media.push(entry) - 1;

    const wrapper = el("div", "media");
    const tile = el("button", entry.isVideo ? "tile video" : "tile");
    tile.type = "button";
    tile.setAttribute(
      "aria-label",
      entry.isVideo ? `Play video: ${entry.title}` : `Expand photo: ${entry.title}`
    );

    if (photo) {
      const img = el("img");
      img.src = photo;
      img.alt = entry.title;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => {
        img.remove();
        tile.insertBefore(this._placeholder(entry.isVideo), tile.firstChild);
      });
      tile.appendChild(img);
    } else {
      // A video with no poster frame still needs something behind the play button.
      tile.appendChild(this._placeholder(true));
    }

    tile.appendChild(el("div", "scrim"));

    if (entry.isVideo) {
      const play = el("div", "play");
      play.appendChild(icon("mdi:play"));
      tile.appendChild(play);

      const kind = el("div", "badge kind");
      kind.appendChild(icon("mdi:video"));
      kind.appendChild(el("span", null, "Video"));
      tile.appendChild(kind);
    } else {
      const expand = el("div", "badge expand");
      expand.appendChild(icon("mdi:magnify-plus-outline"));
      tile.appendChild(expand);
    }

    tile.addEventListener("click", () => this._openViewer(mediaIndex));
    wrapper.appendChild(tile);
    return wrapper;
  }

  _placeholder(isVideo) {
    const placeholder = el("div", "placeholder");
    placeholder.appendChild(icon(isVideo ? "mdi:video-outline" : "mdi:image-off-outline"));
    if (!isVideo) placeholder.appendChild(el("span", null, "Media unavailable"));
    return placeholder;
  }

  // ---------------------------
  // Media viewer
  // ---------------------------
  _buildViewer() {
    const dialog = document.createElement("dialog");
    dialog.className = "viewer";

    const layout = el("div", "viewer-layout");

    const bar = el("div", "viewer-bar");
    const close = this._iconButton("mdi:close", "Close");
    close.addEventListener("click", () => this._closeViewer());
    bar.appendChild(close);
    bar.appendChild(el("div", "spacer"));
    const counter = el("div", "counter");
    bar.appendChild(counter);
    bar.appendChild(el("div", "spacer"));
    const fullscreen = this._iconButton("mdi:fullscreen", "Fullscreen");
    fullscreen.addEventListener("click", () => this._requestFullscreen());
    bar.appendChild(fullscreen);
    layout.appendChild(bar);

    const stage = el("div", "stage");
    const prev = this._iconButton("mdi:chevron-left", "Previous");
    prev.classList.add("nav", "prev");
    prev.addEventListener("click", () => this._step(-1));
    const next = this._iconButton("mdi:chevron-right", "Next");
    next.classList.add("nav", "next");
    next.addEventListener("click", () => this._step(1));
    const frame = el("div", "frame");
    stage.appendChild(prev);
    stage.appendChild(frame);
    stage.appendChild(next);
    layout.appendChild(stage);

    const caption = el("div", "viewer-caption");
    const capTitle = el("div", "cap-title");
    const capMeta = el("div", "cap-meta");
    caption.appendChild(capTitle);
    caption.appendChild(capMeta);
    layout.appendChild(caption);

    dialog.appendChild(layout);
    dialog.addEventListener("cancel", () => this._releaseViewer());
    dialog.addEventListener("close", () => this._releaseViewer());

    // One pointer path covers touch, pen and mouse-drag. Ignore gestures that
    // start on the video itself so native controls keep working.
    let startX = 0;
    let startY = 0;
    let tracking = false;
    stage.addEventListener("pointerdown", (event) => {
      if (event.target.tagName === "VIDEO") return;
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
    });
    stage.addEventListener("pointerup", (event) => {
      if (!tracking) return;
      tracking = false;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this._step(dx < 0 ? 1 : -1);
    });
    stage.addEventListener("pointercancel", () => {
      tracking = false;
    });

    this._viewer = { dialog, frame, counter, capTitle, capMeta, prev, next, fullscreen };
    this.shadowRoot.appendChild(dialog);
  }

  _iconButton(name, label) {
    const button = el("button", "icon-btn");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(icon(name));
    return button;
  }

  _isViewerOpen() {
    return Boolean(this._viewer && this._viewer.dialog.open);
  }

  _openViewer(index) {
    if (!this._viewer || !this._media[index]) return;
    this._viewerIndex = index;
    if (!this._viewer.dialog.open) {
      this._viewer.dialog.showModal();
      this._previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", this._onKeyDown);
    }
    this._showMedia();
  }

  _closeViewer() {
    if (this._viewer && this._viewer.dialog.open) this._viewer.dialog.close();
    else this._releaseViewer();
  }

  _releaseViewer() {
    window.removeEventListener("keydown", this._onKeyDown);
    if (this._previousOverflow !== undefined) {
      document.body.style.overflow = this._previousOverflow;
      this._previousOverflow = undefined;
    }
    this._stopVideo();
    this._viewerIndex = -1;
    if (this._pendingRender) {
      this._pendingRender = false;
      this._render();
    }
  }

  _stopVideo() {
    if (!this._viewer) return;
    const video = this._viewer.frame.querySelector("video");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }

  _step(direction) {
    if (!this._media.length) return;
    const next = (this._viewerIndex + direction + this._media.length) % this._media.length;
    this._viewerIndex = next;
    this._showMedia();
  }

  _showMedia() {
    const entry = this._media[this._viewerIndex];
    if (!entry) return;
    const { frame, counter, capTitle, capMeta, prev, next, fullscreen } = this._viewer;

    this._stopVideo();
    frame.textContent = "";

    if (entry.isVideo) {
      const video = document.createElement("video");
      video.src = entry.video;
      if (entry.photo) video.poster = entry.photo;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("playsinline", "");
      frame.appendChild(video);
    } else {
      const img = el("img");
      img.src = entry.photo;
      img.alt = entry.title;
      frame.appendChild(img);
    }

    counter.textContent = `${this._viewerIndex + 1} of ${this._media.length}`;
    capTitle.textContent = entry.title;
    capMeta.textContent = [entry.timeText, entry.staff ? `by ${entry.staff}` : null].filter(Boolean).join(" · ");

    const single = this._media.length < 2;
    prev.hidden = single;
    next.hidden = single;
    fullscreen.hidden = !entry.isVideo;
  }

  _requestFullscreen() {
    const target = this._viewer.frame.querySelector("video");
    if (!target) return;
    // iOS Safari refuses element fullscreen on anything but the video element.
    if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
    else if (target.webkitEnterFullscreen) target.webkitEnterFullscreen();
  }

  _onKeyDown(event) {
    if (!this._isViewerOpen()) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this._step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      this._step(1);
    }
  }

  // ---------------------------
  // Formatting
  // ---------------------------
  formatDate(timestamp) {
    const d = timestamp instanceof Date ? timestamp : parseDate(timestamp);
    if (!d) return String(timestamp || "");
    switch (this._config.date_format) {
      case "date":
        return d.toLocaleDateString();
      case "time":
        return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      case "long":
        return d.toLocaleString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      case "monthddyy":
        return d.toLocaleString(undefined, {
          month: "long",
          day: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      case "short":
      default:
        return d.toLocaleString();
    }
  }

  // Kept for backwards compatibility -- older forks call this directly.
  getIcon(title) {
    return activityType({ title }).icon;
  }

  renderError(message) {
    this._card = null;
    this._errorShown = true;
    this.shadowRoot.innerHTML = `<style>${CARD_STYLES}</style>`;
    const card = document.createElement("ha-card");
    card.setAttribute("header", "Timeline Card Error");
    card.appendChild(el("div", "error", message));
    this.shadowRoot.appendChild(card);
  }

  // ---------------------------
  // Lovelace plumbing
  // ---------------------------
  getCardSize() {
    if (!this._config) return 3;
    const limit = this._config.number_of_events;
    const count = Math.min(Number.isFinite(limit) ? limit : 10, this._activities.length || 3);
    return Math.max(3, Math.min(12, Math.ceil(count * 1.2) + 1));
  }

  getGridOptions() {
    return { columns: "full", rows: "auto", min_columns: 6, min_rows: 3 };
  }

  static getConfigElement() {
    return document.createElement("procare-timeline-card-editor");
  }

  static getStubConfig(hass) {
    const entity =
      hass && hass.states
        ? Object.keys(hass.states).find((id) => /^sensor\..*_latest_activity$/.test(id))
        : undefined;
    return entity ? { entity } : {};
  }
}

customElements.define("procare-timeline-card", ProcareTimelineCard);

// =============================
// Procare Timeline Card Editor
// =============================
const EDITOR_LABELS = {
  header: "Header",
  entity: "Procare Child Sensor Entity",
  number_of_events: "Number of Events",
  date_format: "Date Format",
  relative_time: "Relative Timestamps",
  group_by_day: "Group by Day",
  collapsible_days: "Collapsible Days",
  show_more: '"Show More" Button',
  compact: "Compact Mode",
  show_staff: "Show Staff Name",
  filter_chips: "Filter Chips",
  hide_types: "Hidden Activity Types",
};

const EDITOR_HELPERS = {
  header: "Card title. Leave blank to hide the header entirely.",
  entity: "The Procare child activity sensor to display.",
  number_of_events: "Most recent events to show. Set to 0 for all of them.",
  date_format: "How absolute timestamps are written out.",
  relative_time: 'Show "2h ago" for events from the last 24 hours.',
  group_by_day: 'Group events under sticky "Today" / "Yesterday" / date headers.',
  collapsible_days: "Let day headers be tapped to collapse. Older days start collapsed.",
  show_more: 'Add a "Show more" button when the feed is longer than the limit above.',
  compact: "Tighter rows and thumbnail-sized media, for narrow dashboard columns.",
  show_staff: 'Show the "by <staff>" attribution on each event.',
  filter_chips: "Add a row of chips at the top for filtering by type at view time.",
  hide_types: "Activity types to leave out of the timeline completely.",
};

function editorSchema() {
  return [
    {
      type: "expandable",
      name: "",
      title: "General",
      icon: "mdi:cog",
      schema: [
        { name: "header", selector: { text: {} } },
        {
          name: "entity",
          required: true,
          selector: { entity: { filter: [{ integration: "procare_activities", domain: "sensor" }] } },
        },
      ],
    },
    {
      type: "expandable",
      name: "",
      title: "Display",
      icon: "mdi:view-agenda-outline",
      schema: [
        { name: "group_by_day", selector: { boolean: {} } },
        { name: "collapsible_days", selector: { boolean: {} } },
        { name: "compact", selector: { boolean: {} } },
        { name: "show_staff", selector: { boolean: {} } },
        { name: "show_more", selector: { boolean: {} } },
      ],
    },
    {
      type: "expandable",
      name: "",
      title: "Filters",
      icon: "mdi:filter-variant",
      schema: [
        { name: "number_of_events", selector: { number: { min: 0, max: 50, step: 1, mode: "box" } } },
        { name: "filter_chips", selector: { boolean: {} } },
        {
          name: "hide_types",
          selector: {
            select: {
              multiple: true,
              mode: "list",
              options: TYPE_MAP.concat([DEFAULT_TYPE]).map((type) => ({ value: type.key, label: type.label })),
            },
          },
        },
      ],
    },
    {
      type: "expandable",
      name: "",
      title: "Date Format",
      icon: "mdi:translate",
      schema: [
        { name: "relative_time", selector: { boolean: {} } },
        {
          name: "date_format",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "monthddyy", label: "Month dd yy" },
                { value: "short", label: "Short" },
                { value: "long", label: "Long" },
                { value: "date", label: "Date only" },
                { value: "time", label: "Time only" },
              ],
            },
          },
        },
      ],
    },
  ];
}

export class ProcareTimelineCardEditor extends HTMLElement {
  setConfig(config) {
    // Normalise the legacy option names so the form shows what the card is
    // actually using, then write back under the current names.
    const next = { ...(config || {}) };
    if (next.title !== undefined && next.header === undefined) {
      next.header = next.title;
      delete next.title;
    }
    if (next.max_events !== undefined && next.number_of_events === undefined) {
      next.number_of_events = next.max_events;
      delete next.max_events;
    }
    this._config = next;
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  connectedCallback() {
    this._update();
  }

  _update() {
    if (!this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (schema) => EDITOR_LABELS[schema.name] || schema.title || schema.name;
      this._form.computeHelper = (schema) => EDITOR_HELPERS[schema.name] || "";
      this._form.addEventListener("value-changed", (event) => {
        event.stopPropagation();
        this._config = { ...this._config, ...event.detail.value };
        this.dispatchEvent(
          new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = editorSchema();
    this._form.data = this._config;
  }
}

customElements.define("procare-timeline-card-editor", ProcareTimelineCardEditor);

// =============================
// Card registration
// =============================
window.customCards = window.customCards || [];
window.customCards.push({
  type: "procare-timeline-card",
  name: "Procare Timeline Card",
  description: "A timeline card to display Procare activities.",
  preview: true,
  documentationURL: DOCS_URL,
});
