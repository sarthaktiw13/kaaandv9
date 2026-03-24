/**
 * KAAAND Analytics — lightweight client tracker
 * Feeds data to /api/track → Stitch export stream
 */
(function() {
  'use strict';

  const BASE = '';
  let sessionId = null;

  // Generate/retrieve session ID
  try {
    sessionId = sessionStorage.getItem('kaaand_sid');
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('kaaand_sid', sessionId);
    }
  } catch(e) {}

  function send(payload) {
    const data = {
      ...payload,
      referrer: document.referrer ? new URL(document.referrer).hostname : '',
      ua: navigator.userAgent.slice(0, 200),
      sid: sessionId,
      ts: Date.now(),
    };
    // Use sendBeacon for reliability, fall back to fetch
    const body = JSON.stringify(data);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(BASE + '/api/track', blob);
    } else {
      fetch(BASE + '/api/track', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  }

  // Track initial pageview
  function trackPageview() {
    send({
      type: 'pageview',
      path: window.location.pathname + window.location.search,
    });
  }

  // Track custom event
  window.kaaandTrack = function(eventName, properties) {
    send({
      type: 'event',
      path: window.location.pathname,
      event: eventName,
      ...(properties || {}),
    });
  };

  // Auto-track section views using IntersectionObserver
  function initSectionTracking() {
    if (!window.IntersectionObserver) return;
    const sections = document.querySelectorAll('[data-section]');
    const seen = new Set();
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
          const id = e.target.dataset.section || e.target.id;
          if (id && !seen.has(id)) {
            seen.add(id);
            window.kaaandTrack('section_view', { section: id });
          }
        }
      });
    }, { threshold: 0.5 });
    sections.forEach(s => obs.observe(s));
  }

  // Auto-track outbound links
  function initLinkTracking() {
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (href.startsWith('http') && !href.includes(window.location.hostname)) {
        window.kaaandTrack('outbound_click', { url: href.slice(0, 200) });
      }
    });
  }

  // Auto-track form submissions
  function initFormTracking() {
    document.addEventListener('submit', e => {
      const form = e.target;
      const id = form.id || form.dataset.form || 'unknown';
      window.kaaandTrack('form_submit', { form: id });
    });
  }

  // Track time on page before leaving
  let startTime = Date.now();
  window.addEventListener('beforeunload', () => {
    const seconds = Math.round((Date.now() - startTime) / 1000);
    if (seconds > 5) {
      send({ type: 'engagement', path: window.location.pathname, seconds });
    }
  });

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      trackPageview();
      initSectionTracking();
      initLinkTracking();
      initFormTracking();
    });
  } else {
    trackPageview();
    initSectionTracking();
    initLinkTracking();
    initFormTracking();
  }
})();
