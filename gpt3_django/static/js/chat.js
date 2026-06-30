// Dynamic chat client: provider -> model dependent menus + AJAX chat.
(function () {
  "use strict";

  const catalog = window.SCENE_MIND_CATALOG || { providers: [], default_provider: null };
  const providerSelect = document.getElementById("provider-select");
  const modelSelect = document.getElementById("model-select");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const log = document.getElementById("chat-log");
  const sendBtn = document.getElementById("chat-send");
  const resetBtn = document.getElementById("chat-reset");
  const statusEl = document.getElementById("chat-status");
  const micBtn = document.getElementById("chat-mic");
  const ttsToggle = document.getElementById("tts-toggle");
  const voiceSelect = document.getElementById("tts-voice");

  const providerById = Object.fromEntries(catalog.providers.map((p) => [p.id, p]));

  // --- Text-to-speech: Angelica speaks the replies -----------------------
  const synth = window.speechSynthesis || null;
  let voices = [];

  // Angelica is a female avatar, so prefer female voices. The Web Speech API
  // exposes no gender field, so match common female voice names (plus any
  // "female" label) and fall back to all English voices if none are found.
  const FEMALE_VOICE_HINTS = [
    "female", "samantha", "victoria", "karen", "kathy", "moira", "tessa",
    "fiona", "allison", "ava", "susan", "vicki", "kate", "serena", "zira",
    "stephanie", "google uk english female", "google us english",
  ];

  function isLikelyFemale(voice) {
    const name = voice.name.toLowerCase();
    if (/\bmale\b/.test(name) && !name.includes("female")) return false;
    return FEMALE_VOICE_HINTS.some((hint) => name.includes(hint));
  }

  function loadVoices() {
    if (!synth) return;
    const english = synth.getVoices().filter((v) => v.lang.startsWith("en"));
    const female = english.filter(isLikelyFemale);
    voices = female.length ? female : english; // never leave the picker empty
    if (!voiceSelect) return;
    voiceSelect.innerHTML = "";
    voices.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });
  }

  function speak(text) {
    if (!synth || !ttsToggle || !ttsToggle.checked || !text) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const chosen = voiceSelect && voices[Number(voiceSelect.value)];
    if (chosen) utter.voice = chosen;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.onstart = () => {
      window.SCENE_MIND_SPEAKING = true;
    };
    utter.onend = utter.onerror = () => {
      window.SCENE_MIND_SPEAKING = false;
    };
    synth.speak(utter);
  }

  // --- Speech-to-text: mic button fills + sends the prompt ---------------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;

  function initRecognition() {
    if (!SpeechRecognition || !micBtn) {
      if (micBtn) micBtn.style.display = "none";
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      input.value = transcript;
      if (event.results[event.results.length - 1].isFinal) {
        const prompt = transcript.trim();
        if (prompt) {
          input.value = "";
          sendMessage(prompt);
        }
      }
    };
    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove("listening");
      micBtn.textContent = "Mic";
    };
    recognition.onerror = () => {
      statusEl.textContent = "Voice input unavailable (mic permission?).";
    };

    micBtn.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
        return;
      }
      if (synth) synth.cancel(); // don't capture our own TTS
      try {
        recognition.start();
        listening = true;
        micBtn.classList.add("listening");
        micBtn.textContent = "Stop";
      } catch (e) {
        /* start() can throw if already running */
      }
    });
  }

  function getCookie(name) {
    const match = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return match ? decodeURIComponent(match.pop()) : "";
  }

  function populateProviders() {
    providerSelect.innerHTML = "";
    catalog.providers.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.available ? p.label : `${p.label} — not configured`;
      opt.disabled = !p.available;
      providerSelect.appendChild(opt);
    });
    const def = catalog.default_provider;
    if (def && providerById[def] && providerById[def].available) {
      providerSelect.value = def;
    } else {
      const firstAvail = catalog.providers.find((p) => p.available);
      if (firstAvail) providerSelect.value = firstAvail.id;
    }
  }

  function populateModels() {
    const provider = providerById[providerSelect.value];
    modelSelect.innerHTML = "";
    if (!provider) return;
    provider.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.label;
      opt.title = m.description || "";
      modelSelect.appendChild(opt);
    });
    if (provider.default_model) modelSelect.value = provider.default_model;
  }

  function addBubble(role, text) {
    const wrap = document.createElement("div");
    wrap.className = `chat-bubble chat-${role}`;
    wrap.textContent = text;
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    input.disabled = busy;
    statusEl.textContent = busy ? "Thinking…" : "";
  }

  async function sendMessage(prompt) {
    addBubble("user", prompt);
    setBusy(true);
    const pending = addBubble("assistant", "…");
    try {
      const resp = await fetch("/api/chat/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({
          prompt,
          provider: providerSelect.value,
          model: modelSelect.value,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        pending.textContent = `⚠ ${data.error || "Request failed."}`;
        pending.classList.add("chat-error");
      } else {
        pending.textContent = data.answer;
        statusEl.textContent = `via ${data.provider} · ${data.model}`;
        speak(data.answer);
      }
    } catch (err) {
      pending.textContent = "⚠ Network error. Is the server running?";
      pending.classList.add("chat-error");
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  if (!providerSelect || !form) return; // template not present

  populateProviders();
  populateModels();
  providerSelect.addEventListener("change", populateModels);

  // Voice setup (no-ops gracefully where the browser lacks support).
  if (synth) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== "undefined") {
      synth.onvoiceschanged = loadVoices;
    }
  } else if (ttsToggle) {
    ttsToggle.closest(".voice-controls")?.style.setProperty("display", "none");
  }
  initRecognition();

  // Stop speaking if the user leaves the page.
  window.addEventListener("beforeunload", () => synth && synth.cancel());

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = "";
    sendMessage(prompt);
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      log.innerHTML = "";
      statusEl.textContent = "Conversation reset.";
      try {
        await fetch("/api/chat/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          body: JSON.stringify({ reset: true, prompt: "" }),
        });
      } catch (e) {
        /* best-effort */
      }
    });
  }
})();
