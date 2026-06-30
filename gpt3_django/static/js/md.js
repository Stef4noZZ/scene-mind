// Sanitized markdown rendering for model output.
// Uses marked + DOMPurify (+ highlight.js if present). Model output is HTML
// rendered into the DOM, so sanitization is mandatory to prevent XSS.
(function () {
  "use strict";

  function escapeToHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  function render(text) {
    const src = text || "";
    if (!window.marked || !window.DOMPurify) {
      return escapeToHtml(src); // graceful fallback: plain, escaped text
    }
    try {
      const raw = window.marked.parse(src, { gfm: true, breaks: true });
      return window.DOMPurify.sanitize(raw);
    } catch (e) {
      return escapeToHtml(src);
    }
  }

  function renderInto(el, text) {
    el.innerHTML = render(text);
    if (window.hljs) {
      el.querySelectorAll("pre code").forEach((block) => {
        try {
          window.hljs.highlightElement(block);
        } catch (e) {
          /* ignore highlight failures */
        }
      });
    }
  }

  window.SceneMindMarkdown = { render, renderInto };
})();
