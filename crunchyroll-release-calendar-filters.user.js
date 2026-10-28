// ==UserScript==
// @name         Crunchyroll Release Calendar Filters
// @namespace    https://www.crunchyroll.com/
// @version      1.0.7
// @description  Filter Crunchyroll calendar releases by audio language and watchlist status.
// @match        https://www.crunchyroll.com/releasecalendar*
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(() => {
  'use strict';

  const onCalendar = () => location.origin === 'https://www.crunchyroll.com'
    && location.pathname === '/releasecalendar';
  if (!onCalendar()) return;

  const PREFIX = '[CR Calendar Filters]';
  const VERSION = '1.0.7';
  const CALENDAR = '.erc-release-calendar';
  const CELL = '[data-t="release-cell"]';
  const CARD = '[data-t="release-calendar-card"]';
  const PANEL = '.erc-filter-controls';
  const DEBUG = true;
  const checkedPath = 'M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-5.332-2.957 1.414 1.414-5.207 5.207-2.957-2.957 1.414-1.414 1.543 1.543 3.793-3.793Z';
  const uncheckedPath = 'M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0ZM8 9.414l-2.293 2.293-1.414-1.414L6.586 8 4.293 5.707l1.414-1.414L8 6.586l2.293-2.293 1.414 1.414L9.414 8l2.293 2.293-1.414 1.414L8 9.414Z';
  const log = (event, details = {}) => DEBUG && console.info(PREFIX, event, details);

  log('startup', { version: VERSION, path: location.pathname, readyState: document.readyState });

  let hideDubs = false;
  let watchlistOnly = false;
  let alwaysShowPremieres = false;
  let observer;
  let refreshTimer;
  let routeTimer;
  let stopped = false;
  let lastSummary = '';
  const hiddenBeforeFilter = new Map();
  const tabindexBeforeFilter = new Map();
  const styles = document.createElement('style');
  styles.textContent = `${PANEL} { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
    ${PANEL} [hidden], ${CELL}[hidden] { display: none !important; }`;
  (document.head || document.documentElement).append(styles);

  function audioState(card) {
    const labels = [...card.querySelectorAll('[aria-label^="Audio languages:"]')]
      .map(node => node.getAttribute('aria-label').replace(/^Audio languages:\s*/i, '').trim())
      .filter(Boolean);
    return { known: labels.length > 0, japanese: labels.some(value => /(?:^|,)\s*JA\s*(?:,|$)/i.test(value)) };
  }

  function membership(card) {
    const inList = card.querySelector('[data-t="remove-from-watchlist-btn"]');
    const outOfList = card.querySelector('[data-t="add-to-watchlist-btn"]');
    if (Boolean(inList) === Boolean(outOfList)) return 'unknown';
    return inList ? 'in' : 'out';
  }

  function updateCounts() {
    for (const day of document.querySelectorAll(`${CALENDAR} [data-t="day-column"], ${CALENDAR} .erc-day-column`)) {
      const date = day.querySelector('.day-header .day-date, [data-t="release-day-header"]');
      if (!date) continue;
      let count = date.nextElementSibling;
      if (!count?.hasAttribute('data-erc-hidden-count')) {
        count = document.createElement('div');
        count.dataset.ercHiddenCount = '';
        count.setAttribute('aria-live', 'polite');
        count.className = date.className;
        date.insertAdjacentElement('afterend', count);
      }
      const body = day.querySelector('.day-body') || day;
      const hidden = [...body.querySelectorAll(CELL)].filter(cell => cell.hidden).length;
      const text = `${hidden} release${hidden === 1 ? '' : 's'} hidden`;
      if (count.textContent !== text) count.textContent = text;
    }
  }

  function updateKeyboardAccess(cells) {
    if (!hideDubs && !watchlistOnly) {
      for (const [link, tabindex] of tabindexBeforeFilter) {
        if (tabindex === null) link.removeAttribute('tabindex');
        else link.setAttribute('tabindex', tabindex);
      }
      tabindexBeforeFilter.clear();
      return;
    }
    for (const cell of cells) {
      if (cell.hidden) continue;
      for (const link of cell.querySelectorAll('[data-t="watch-page-link"]')) {
        if (!tabindexBeforeFilter.has(link)) tabindexBeforeFilter.set(link, link.getAttribute('tabindex'));
        link.setAttribute('tabindex', '0');
      }
    }
  }

  function updateFilters() {
    const cells = [...document.querySelectorAll(`${CALENDAR} ${CELL}`)];
    let visible = 0;
    for (const cell of cells) {
      const card = cell.querySelector(CARD);
      if (!hiddenBeforeFilter.has(cell)) hiddenBeforeFilter.set(cell, cell.hidden);
      const audio = card ? audioState(card) : { known: false, japanese: false };
      const watch = card ? membership(card) : 'unknown';
      const premiere = Boolean(card?.querySelector('[data-t="premiere-tag"]'));
      cell.hidden = (hideDubs && audio.known && !audio.japanese)
        || (watchlistOnly && watch === 'out' && !(alwaysShowPremieres && premiere));
      if (!cell.hidden) visible++;
    }
    updateKeyboardAccess(cells);
    updateCounts();
    const summary = JSON.stringify({ total: cells.length, visible, hideDubs, watchlistOnly, alwaysShowPremieres });
    if (summary !== lastSummary) {
      lastSummary = summary;
      log('filters applied', JSON.parse(summary));
    }
  }

  function syncSwitch(label, value, checkedClass) {
    const input = label.querySelector('input');
    if (input.checked !== value) input.checked = value;
    const ariaChecked = String(value);
    if (label.getAttribute('aria-checked') !== ariaChecked) label.setAttribute('aria-checked', ariaChecked);
    label.parentElement.classList.toggle(checkedClass, value);
    const icon = label.querySelector('[class*="toggle__switch-icon--"] svg');
    const path = icon?.querySelector('path');
    if (icon && path) {
      const iconName = value ? 'circle_checkmark_filled-svg' : 'circle_cross_filled-svg';
      const shape = value ? checkedPath : uncheckedPath;
      if (icon.getAttribute('data-t') !== iconName) icon.setAttribute('data-t', iconName);
      if (path.getAttribute('d') !== shape) path.setAttribute('d', shape);
    }
  }

  function makeControl(text, key, value, nativeSwitch, checkedClass, onChange) {
    const nativeWrapper = nativeSwitch.closest('.erc-time-format-toggle');
    const nativeLabel = nativeSwitch.closest('label');
    const wrapper = nativeWrapper.cloneNode(false);
    const label = nativeLabel.cloneNode(true);
    for (const node of [label, ...label.querySelectorAll('*')]) {
      for (const name of ['id', 'for', 'aria-labelledby', 'aria-describedby']) node.removeAttribute(name);
    }
    const input = label.querySelector('input');
    input.name = `cr-calendar-${key}`;
    input.tabIndex = -1;
    input.disabled = false;
    label.setAttribute('aria-label', text);
    label.tabIndex = 0;
    label.dataset.preference = key;
    label.querySelector('[class*="toggle__label--"]').textContent = text;
    label.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) input.click();
    });
    label.addEventListener('click', event => {
      if (!event.detail) return;
      setTimeout(() => {
        if (document.activeElement === label || document.activeElement === input) document.activeElement.blur();
      }, 0);
    });
    input.addEventListener('change', () => {
      syncSwitch(label, input.checked, checkedClass);
      onChange(input.checked);
    });
    wrapper.append(label);
    syncSwitch(label, value, checkedClass);
    return wrapper;
  }

  function mount() {
    const calendar = document.querySelector(CALENDAR);
    const layout = calendar?.querySelector('.timezone-controls');
    const native = layout?.querySelector('[name="release-calendar-time-format"]');
    if (!calendar || !layout || !native) return;

    let panel = layout.querySelector(PANEL);
    if (!panel) {
      const nativeWrapper = native.closest('.erc-time-format-toggle');
      const checkedClass = [...nativeWrapper.classList].find(name => name.startsWith('toggle--is-checked--'))
        || 'toggle--is-checked--1b3CX';
      panel = document.createElement('div');
      panel.className = 'erc-filter-controls';
      panel.append(
        makeControl('Hide dubs', 'hideDubs', hideDubs, native, checkedClass, value => {
          hideDubs = value;
          log('filter changed', { hideDubs });
          updateFilters();
          GM.setValue('hideDubs', value).catch(error => console.error(PREFIX, 'Saving hideDubs failed', error));
        }),
        makeControl('Watchlist only', 'watchlistOnly', watchlistOnly, native, checkedClass, value => {
          watchlistOnly = value;
          log('filter changed', { watchlistOnly });
          updatePremiereVisibility(panel);
          updateFilters();
          GM.setValue('watchlistOnly', value).catch(error => console.error(PREFIX, 'Saving watchlistOnly failed', error));
        }),
        makeControl('Always show premieres', 'alwaysShowPremieres', alwaysShowPremieres, native, checkedClass, value => {
          alwaysShowPremieres = value;
          log('filter changed', { alwaysShowPremieres });
          updateFilters();
          GM.setValue('alwaysShowPremieres', value).catch(error => console.error(PREFIX, 'Saving alwaysShowPremieres failed', error));
        })
      );
      layout.append(panel);
      log('controls mounted');
    } else {
      for (const [key, value] of [['hideDubs', hideDubs], ['watchlistOnly', watchlistOnly], ['alwaysShowPremieres', alwaysShowPremieres]]) {
        const label = panel.querySelector(`[data-preference="${key}"]`);
        const checkedClass = [...label.parentElement.classList].find(name => name.startsWith('toggle--is-checked--'))
          || 'toggle--is-checked--1b3CX';
        syncSwitch(label, value, checkedClass);
      }
    }
    updatePremiereVisibility(panel);
    updateFilters();
  }

  function updatePremiereVisibility(panel) {
    const premieres = panel.querySelector('[data-preference="alwaysShowPremieres"]');
    premieres.parentElement.hidden = !watchlistOnly;
  }

  function refresh() {
    if (stopped) return;
    if (!onCalendar()) return stop();
    try { mount(); } catch (error) { console.error(PREFIX, 'Calendar refresh failed', error); }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    observer?.disconnect();
    clearTimeout(refreshTimer);
    clearInterval(routeTimer);
    for (const [cell, hidden] of hiddenBeforeFilter) cell.hidden = hidden;
    for (const [link, tabindex] of tabindexBeforeFilter) {
      if (tabindex === null) link.removeAttribute('tabindex');
      else link.setAttribute('tabindex', tabindex);
    }
    document.querySelectorAll(`${PANEL}, [data-erc-hidden-count]`).forEach(node => node.remove());
    styles.remove();
    log('stopped after leaving calendar URL');
  }

  async function start() {
    log('loading preferences');
    try {
      [hideDubs, watchlistOnly, alwaysShowPremieres] = await Promise.all([
        GM.getValue('hideDubs', false), GM.getValue('watchlistOnly', false), GM.getValue('alwaysShowPremieres', false)
      ]).then(values => values.map(value => value === true));
      log('preferences loaded', { hideDubs, watchlistOnly, alwaysShowPremieres });
    } catch (error) {
      console.error(PREFIX, 'Loading preferences failed; using defaults', error);
    }
    if (stopped || !onCalendar()) return stop();
    refresh();
    observer = new MutationObserver(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 60);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-t', 'aria-label'] });
    window.addEventListener('popstate', () => !onCalendar() && stop());
    window.addEventListener('hashchange', () => !onCalendar() && stop());
    routeTimer = setInterval(() => !onCalendar() && stop(), 500);
    log('observer started');
  }

  if (typeof GM !== 'undefined' && GM.getValue && GM.setValue) start();
  else console.error(PREFIX, 'GM storage API unavailable. Check the FireMonkey grants and reload the page.');
})();
