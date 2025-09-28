// procare-timeline-card.js

class ProcareTimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this._config = {
      title: config.title || 'Procare Activities',
      entity: config.entity,
      max_events: config.max_events || 10,
      date_format: config.date_format || 'short',
    };
  }

  set hass(hass) {
    if (!this._config) return;
    const entityId = this._config.entity;
    const state = hass.states[entityId];

    if (!state) {
      this.renderError(`Entity not found: ${entityId}`);
      return;
    }

    const activities = state.attributes.activities || [];
    const limitedActivities = activities.slice(0, this._config.max_events);
    this.render(limitedActivities);
  }

  getIcon(title) {
    title = title.toLowerCase();
    if (title.includes('meal') || title.includes('snack') || title.includes('breakfast')) return 'mdi:silverware-fork-knife';
    if (title.includes('nap')) return 'mdi:power-sleep';
    if (title.includes('diaper')) return 'mdi:baby-carriage';
    if (title.includes('health')) return 'mdi:heart-pulse';
    if (title.includes('incident')) return 'mdi:alert-circle-outline';
    if (title.includes('potty')) return 'mdi:human-male-female';
    if (title.includes('learning')) return 'mdi:school';
    if (title.includes('meds')) return 'mdi:pill';
    if (title.includes('signed in')) return 'mdi:login';
    if (title.includes('signed out')) return 'mdi:logout';
    if (title.includes('note')) return 'mdi:note-text-outline';
    return 'mdi:child-toy';
  }

  formatDate(timestamp) {
    const d = new Date(timestamp);
    switch (this._config.date_format) {
      case "date": return d.toLocaleDateString();
      case "time": return d.toLocaleTimeString();
      case "long": return d.toLocaleString(undefined, {
        weekday: "long", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
      case "short":
      default:
        return d.toLocaleString();
    }
  }
  
  render(activities) {
    const cardTitle = this._config.title;

    if (!this.shadowRoot.querySelector('ha-card')) {
      this.shadowRoot.innerHTML = `
        <style>
          ha-card { padding: 16px; }
          .timeline { position: relative; padding-left: 50px; }
          .timeline::before {
            content: ''; position: absolute; left: 18px; top: 10px; bottom: 10px; width: 2px; background: var(--primary-color);
          }
          .timeline-item { position: relative; margin-bottom: 24px; }
          .timeline-icon {
            position: absolute; left: -33px; top: 0;
            color: var(--primary-color);
            background-color: var(--card-background-color);
            border-radius: 50%; display: flex;
            align-items: center; justify-content: center;
            z-index: 1; width: 40px; height: 40px;
          }
          .timeline-content .title { font-weight: bold; font-size: 1.1em; margin-bottom: 4px; }
          .timeline-content .time { color: var(--secondary-text-color); font-size: 0.9em; margin-bottom: 8px; }
          .timeline-content .description { color: var(--primary-text-color); }
          .timeline-content .staff { font-style: italic; color: var(--secondary-text-color); margin-top: 4px; }
          .timeline-content img { max-width: 100%; border-radius: 8px; margin-top: 8px; }
          .no-activities { padding: 16px; }
        </style>
        <ha-card header="${cardTitle}">
          <div id="timeline-container"></div>
        </ha-card>
      `;
    }

    const container = this.shadowRoot.getElementById('timeline-container');

    if (activities.length === 0) {
      container.innerHTML = `<div class="no-activities">No activities to display.</div>`;
      return;
    }

    let timelineHtml = '<div class="timeline">';
    activities.forEach(activity => {
      const icon = this.getIcon(activity.title);
      const time = this.formatDate(activity.timestamp);
      const title = activity.title || 'Activity';
      const description = activity.details || '';
      const staff = activity.staff ? `<div class="staff">by ${activity.staff}</div>` : '';
      const photo = activity.photo_url ? `<img src="${activity.photo_url}" alt="Activity photo">` : '';

      timelineHtml += `
        <div class="timeline-item">
          <div class="timeline-icon"><ha-icon icon="${icon}"></ha-icon></div>
          <div class="timeline-content">
            <div class="title">${title}</div>
            <div class="time">${time}</div>
            <div class="description">${description}</div>
            ${staff}
            ${photo}
          </div>
        </div>
      `;
    });
    timelineHtml += '</div>';
    
    container.innerHTML = timelineHtml;
  }

  renderError(error) {
    this.shadowRoot.innerHTML = `
      <style>.error { color: var(--error-color); padding: 16px; }</style>
      <ha-card header="Timeline Card Error"><div class="error">${error}</div></ha-card>
    `;
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement("procare-timeline-card-editor");
  }

  static getStubConfig() {
    return {
      entity: "sensor.procare_child_name",
    };
  }
}

customElements.define('procare-timeline-card', ProcareTimelineCard);

class ProcareTimelineCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = config;
    this.render();
  }

  _valueChanged(ev) {
    if (!this._config) return;
    const target = ev.target;
    const newConfig = { ...this._config };
    newConfig[target.configValue] = target.value;
    
    const event = new Event("config-changed", { bubbles: true, composed: true });
    event.detail = { config: newConfig };
    this.dispatchEvent(event);
  }

  render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        .card-config { display: flex; flex-direction: column; gap: 16px; }
        paper-input, paper-dropdown-menu { width: 100%; }
      </style>
      <div class="card-config">
        <paper-input
          label="Entity (Required)"
          .value="${this._config.entity || ''}"
          configValue="entity"
          @value-changed="${this._valueChanged.bind(this)}"
        ></paper-input>

        <paper-input
          label="Title (Optional)"
          .value="${this._config.title || ''}"
          configValue="title"
          @value-changed="${this._valueChanged.bind(this)}"
        ></paper-input>

        <paper-input
          label="Max Events"
          type="number"
          .value="${this._config.max_events || 10}"
          configValue="max_events"
          @value-changed="${this._valueChanged.bind(this)}"
        ></paper-input>

        <paper-dropdown-menu
          label="Date Format"
          configValue="date_format"
          @value-changed="${this._valueChanged.bind(this)}"
        >
          <paper-listbox
            slot="dropdown-content"
            selected="${["short", "date", "time", "long"].indexOf(this._config.date_format || 'short')}"
          >
            <paper-item>short</paper-item>
            <paper-item>date</paper-item>
            <paper-item>time</paper-item>
            <paper-item>long</paper-item>
          </paper-listbox>
        </paper-dropdown-menu>
      </div>
    `;
  }
}

customElements.define("procare-timeline-card-editor", ProcareTimelineCardEditor);


window.customCards = window.customCards || [];
window.customCards.push({
  type: 'procare-timeline-card',
  name: 'Procare Timeline Card',
  description: 'A timeline card to display Procare activities.',
});