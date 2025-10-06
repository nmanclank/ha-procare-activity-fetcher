// PrcareTimelineCard.js

import { LitElement, css, html } from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

// =============================
// Procare Timeline Card Editor
// =============================
export class ProcareTimelineCardEditor extends LitElement {
  static get properties() {
    return {
      _config: { type: Object },
    };
  }

  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
  }

  // Main card editor render --  
    render() {
        if (!this._config) {
            return html`<div>Please configure the card.</div>`;
        }
    const generalSchema = this._getSchema().slice(0,2);

    const filterSchema = this._getSchema().slice(2,3);

    const dateFormatSchema = this._getSchema().slice(3,4);


    return html`
            <style>
                .card-content {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                details {
                    border: 1px solid var(--divider-color, #eeeeee);
                    border-radius: var(--ha-card-border-radius, 20px);
                    margin-bottom: 0;
                    overflow: hidden;
                }
                summary {
                    font-weight: 500;
                    font-size: 1rem;
                    padding: 12px 16px;
                    cursor: pointer;
                    outline: none;
                    user-select: none;
                    display: flex;
                    align-items: center;
                }
                summary::-webkit-details-marker {
                    display: none;
                }
                summary:before {
                    content: '';
                    display: inline-block;
                    margin-right: 8px;
                    border-style: solid;
                    border-width: 0.35em 0.35em 0 0.35em;
                    border-color: var(--primary-text-color) transparent transparent transparent;
                    vertical-align: middle;
                    transition: transform 0.2s;
                    transform: rotate(-90deg);
                }
                details[open] summary:before {
                    transform: rotate(0deg);
                }
                .section-content {
                    padding: 16px;
                }
                .section-icon {
                    margin-right: 8px;
                    color: var(--primary-text-color);
                    font-size: 20px;
                    vertical-align: middle;
                }
            </style>
            <ha-card>
                <div class="card-content">
                    <details open>
                        <summary><ha-icon class="section-icon" icon="mdi:cog"></ha-icon>General</summary>
                        <div class="section-content">
                            <ha-form
                                .data=${this._config}
                                .schema=${generalSchema}
                                .computeLabel=${this._computeLabel}
                                .computeHelper=${this._computeHelper}
                                @value-changed=${this._valueChanged}
                            ></ha-form>
                        </div>
                    </details>
                    <details>
                        <summary><ha-icon class="section-icon" icon="mdi:filter-variant"></ha-icon>Filters</summary>
                        <div class="section-content">
                            <ha-form
                                .data=${this._config}
                                .schema=${filterSchema}
                                .computeLabel=${this._computeLabel}
                                .computeHelper=${this._computeHelper}
                                @value-changed=${this._valueChanged}
                            ></ha-form>
                        </div>
                    </details>
                    <details>
                        <summary><ha-icon class="section-icon" icon="mdi:translate"></ha-icon>Date Format</summary>
                        <div class="section-content">
                            <ha-form
                                .data=${this._config}
                                .schema=${dateFormatSchema}
                                .computeLabel=${this._computeLabel}
                                .computeHelper=${this._computeHelper}
                                @value-changed=${this._valueChanged}
                            ></ha-form>
                        </div>
                    </details>
                </div>
            </ha-card>
        `;
    }
  _getSchema() {
    const hass = this._hass;
    const generalSchema = [
      {
        name: "header",
        description: "Header text for the card.",
        selector: { text: {} }
      },
      {
        name: "entity",
        description: "Select the Procare child timeline entity to display.",
        selector: {
          select: {
            mode: "dropdown",
            options: hass ? (
              Object.keys(hass.states)
                .filter(entity => entity.startsWith('sensor.'))
                .map(entity => ({
                  value: entity,
                  label: hass.states[entity].attributes.friendly_name || entity
                }))
            ) : []
          }
        }
      }
    ];
    const filterSchema = [
      {
        name: "number_of_events",
        description: "Number of most recent events to display. A maximum of 10 events can be displayed.",
        selector: { number: { min: 1, max: 10, step: 1 } }
      }
    ];
    const dateFormatSchema = [
      {
        name: "date_format",
        description: "Date format for the card.",
        selector: {
          select: {
            options: [
              { value: "short", label: "Short" },
              { value: "long", label: "Long" },
              { value: "monthddyy", label: "Month dd yy" }
            ]
          }
        }
      }
    ];

    return [
      ...generalSchema,
      ...filterSchema,
      ...dateFormatSchema
    ];
  }
  _computeLabel(schema) {
    const labels = {
      header: "Header",
      entity: "Procare Child Sensor Entity",
      number_of_events: "Number of Events",
      date_format: "Date Format"
    };
    return labels[schema.name] || schema.name;
  }

    _computeHelper = (schema) => schema.description || "";

  _valueChanged(event) {
    let newConfig = event.detail.value;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: newConfig } }));
  }

    static get styles() {
        return css`
            ha-card {
                padding: 16px;
            }
            .card-content {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
        `;
    }
}

customElements.define("procare-timeline-card-editor", ProcareTimelineCardEditor);

// =============================
// Card registration
// =============================
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'procare-timeline-card',
  name: 'Procare Timeline Card',
  description: 'A timeline card to display Procare activities.',
});


// =============================
// Procare Timeline Card
// =============================
class ProcareTimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You must define an entity');
    }
    this._config = {
      header: config.header || 'Procare Activities',
      entity: config.entity,
      number_of_events: config.number_of_events || 10,
      date_format: config.date_format || 'monthddyy',
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
    const limitedActivities = activities.slice(0, this._config.number_of_events);
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
      case "monthddyy": return d.toLocaleString(undefined, {
        month: "long", day: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit"
      });
      case "short":
      default:
        return d.toLocaleString();
    }
  }

  render(activities) {
    const cardTitle = this._config.header;

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
            <div class="title">  ${title}</div>
            <div class="time">  ${time}</div>
            <div class="description">  ${description}</div>
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
    return {}; // no default entity
  }
}

customElements.define('procare-timeline-card', ProcareTimelineCard);

