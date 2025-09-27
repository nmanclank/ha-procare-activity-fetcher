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
    this._config = config;
  }

  set hass(hass) {
    const entityId = this._config.entity;
    const state = hass.states[entityId];

    if (!state) {
      this.renderError(`Entity not found: ${entityId}`);
      return;
    }

    const activities = state.attributes.activities || [];
    this.render(activities);
  }

  render(activities) {
    const cardTitle = this._config.title || 'Procare Activities';

    if (!this.shadowRoot.innerHTML) {
      this.shadowRoot.innerHTML = `
        <style>
          ha-card {
            padding: 16px;
          }
          .timeline {
            position: relative;
            padding-left: 50px; /* Space for the icons and line */
          }
          .timeline::before {
            content: '';
            position: absolute;
            left: 18px; /* Center the line on the icon */
            top: 10px;
            bottom: 10px;
            width: 2px;
            background: var(--primary-color);
          }
          .timeline-item {
            position: relative;
            margin-bottom: 24px;
          }
          .timeline-icon {
            position: absolute;
            left: -33px;
            top: 0;
            color: var(--primary-color);
            background-color: var(--card-background-color);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1;
            width: 40px;
            height: 40px;
          }
          .timeline-content .title {
            font-weight: bold;
            font-size: 1.1em;
            margin-bottom: 4px;
          }
          .timeline-content .time {
            color: var(--secondary-text-color);
            font-size: 0.9em;
            margin-bottom: 8px;
          }
          .timeline-content .description {
            color: var(--primary-text-color);
          }
          .timeline-content .staff {
            font-style: italic;
            color: var(--secondary-text-color);
          }
          .timeline-content img {
            max-width: 100%;
            border-radius: 8px;
            margin-top: 8px;
          }
          .no-activities {
            padding: 16px;
          }
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
    
    // UPDATED: icon mapping based on activity title
    const getIcon = (title) => {
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
        return 'mdi:child-toy'; // Default icon
    };

    activities.forEach(activity => {
      const icon = getIcon(activity.title);
      // WIP: Using 'timestamp' instead of 'created_at'
      const time = new Date(activity.timestamp).toLocaleString(); 
      const title = activity.title || 'Activity';
      // WIP: Using 'details' instead of 'notes'
      const description = activity.details || '';
      // WIP: Added staff info
      const staff = activity.staff ? `<div class="staff">by ${activity.staff}</div>` : '';
      // WIP: photo display
      const photo = activity.photo_url ? `<img src="${activity.photo_url}" alt="Activity photo">` : '';

      timelineHtml += `
        <div class="timeline-item">
          <div class="timeline-icon">
            <ha-icon icon="${icon}"></ha-icon>
          </div>
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
      <style>
        .error {
          color: var(--error-color);
          padding: 16px;
        }
      </style>
      <ha-card header="Timeline Card Error">
        <div class="error">${error}</div>
      </ha-card>
    `;
  }

  getCardSize() {
    return 3;
  }
}

customElements.define('procare-timeline-card', ProcareTimelineCard);

// card preview for the card picker 
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'procare-timeline-card',
  name: 'Procare Timeline Card',
  description: 'A timeline card to display Procare activities.',
  preview: true,
});