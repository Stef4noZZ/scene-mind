// Multi-model compare: ask one prompt across several provider/model targets
// and render the answers side by side.
(function () {
  "use strict";

  const catalog = window.SCENE_MIND_CATALOG || { providers: [] };
  const targetsEl = document.getElementById("compare-targets");
  const input = document.getElementById("compare-input");
  const runBtn = document.getElementById("compare-run");
  const statusEl = document.getElementById("compare-status");
  const resultsEl = document.getElementById("compare-results");

  if (!targetsEl || !runBtn) return; // section not on the page

  function getCookie(name) {
    const match = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return match ? decodeURIComponent(match.pop()) : "";
  }

  // Build target checkboxes from the available providers only.
  const available = catalog.providers.filter((p) => p.available);
  if (!available.length) {
    targetsEl.textContent = "No providers are configured. Enable one in .env (mock is always on).";
    runBtn.disabled = true;
  }
  available.forEach((p) => {
    const group = document.createElement("div");
    group.className = "compare-group";
    const head = document.createElement("div");
    head.className = "small text-white-50 mb-1";
    head.textContent = p.label;
    group.appendChild(head);
    p.models.forEach((m) => {
      const label = document.createElement("label");
      label.className = "form-check form-check-inline";
      const cb = document.createElement("input");
      cb.className = "form-check-input";
      cb.type = "checkbox";
      cb.dataset.provider = p.id;
      cb.dataset.model = m.id;
      const span = document.createElement("span");
      span.className = "form-check-label";
      span.textContent = m.label;
      label.appendChild(cb);
      label.appendChild(span);
      group.appendChild(label);
    });
    targetsEl.appendChild(group);
  });

  function selectedTargets() {
    return Array.from(targetsEl.querySelectorAll("input:checked")).map((cb) => ({
      provider: cb.dataset.provider,
      model: cb.dataset.model,
    }));
  }

  function renderCard(r) {
    const card = document.createElement("div");
    card.className = "compare-card";
    const head = document.createElement("div");
    head.className = "compare-card-head";
    const latency = r.latency_ms != null ? ` · ${r.latency_ms} ms` : "";
    head.textContent = `${r.provider} · ${r.model}${latency}`;
    const body = document.createElement("div");
    body.className = "compare-card-body";
    if (r.error) {
      body.classList.add("chat-error");
      body.textContent = `⚠ ${r.error}`;
    } else if (window.SceneMindMarkdown) {
      window.SceneMindMarkdown.renderInto(body, r.answer || "");
    } else {
      body.textContent = r.answer || "";
    }
    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  runBtn.addEventListener("click", async () => {
    const prompt = (input.value || "").trim();
    const targets = selectedTargets();
    if (!prompt) {
      statusEl.textContent = "Enter a question to compare.";
      return;
    }
    if (!targets.length) {
      statusEl.textContent = "Select at least one model.";
      return;
    }
    runBtn.disabled = true;
    statusEl.textContent = `Comparing ${targets.length} model(s)…`;
    resultsEl.innerHTML = "";
    try {
      const resp = await fetch("/api/compare/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ prompt, targets }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        statusEl.textContent = `⚠ ${data.error || "Compare failed."}`;
      } else {
        statusEl.textContent = `Compared ${data.results.length} model(s).`;
        data.results.forEach((r) => resultsEl.appendChild(renderCard(r)));
      }
    } catch (err) {
      statusEl.textContent = "⚠ Network error. Is the server running?";
    } finally {
      runBtn.disabled = false;
    }
  });
})();
