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
  const convoToggle = document.getElementById("convo-toggle");

  const providerById = Object.fromEntries(catalog.providers.map((p) => [p.id, p]));

  // --- Text-to-speech: the active avatar speaks the replies --------------
  const synth = window.speechSynthesis || null;
  let voices = [];
  // Voice gender follows the selected 3D character (Angelica=female by default,
  // Iasonas=male). The Web Speech API exposes no gender field, so we match by
  // common voice names and fall back to all English voices if none match.
  let currentGender = "female";

  const FEMALE_VOICE_HINTS = [
    "female", "samantha", "victoria", "karen", "kathy", "moira", "tessa",
    "fiona", "allison", "ava", "susan", "vicki", "kate", "serena", "zira",
    "stephanie", "google uk english female", "google us english",
  ];
  const MALE_VOICE_HINTS = [
    "male", "alex", "albert", "daniel", "fred", "ralph", "rishi", "tom",
    "aaron", "arthur", "oliver", "george", "james", "mark", "david",
    "google uk english male",
  ];

  function matchesHints(voice, hints) {
    const name = voice.name.toLowerCase();
    if (hints === MALE_VOICE_HINTS && name.includes("female")) return false;
    if (hints === FEMALE_VOICE_HINTS && /\bmale\b/.test(name) && !name.includes("female")) {
      return false;
    }
    return hints.some((hint) => name.includes(hint));
  }

  function loadVoices() {
    if (!synth) return;
    const english = synth.getVoices().filter((v) => v.lang.startsWith("en"));
    let pool = english;
    if (currentGender === "female") pool = english.filter((v) => matchesHints(v, FEMALE_VOICE_HINTS));
    else if (currentGender === "male") pool = english.filter((v) => matchesHints(v, MALE_VOICE_HINTS));
    voices = pool.length ? pool : english; // never leave the picker empty
    if (!voiceSelect) return;
    voiceSelect.innerHTML = "";
    voices.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });
  }

  // Re-pick voices whenever the active 3D character changes.
  window.addEventListener("scene-mind:model", (e) => {
    const gender = (e.detail && e.detail.gender) || "";
    if (gender !== currentGender) {
      currentGender = gender;
      loadVoices();
    }
  });

  // --- Streaming TTS ------------------------------------------------------
  // Speak complete sentences as they stream in (lower perceived latency), and
  // drive a "mouth openness" value (window.SCENE_MIND_MOUTH) from word-boundary
  // events so the 3D avatar animates roughly in sync with speech.
  let spokenIdx = 0; // chars of the current answer already enqueued for speech

  function ttsEnabled() {
    return synth && ttsToggle && ttsToggle.checked;
  }

  function resetSpeech() {
    spokenIdx = 0;
    if (synth) synth.cancel();
    window.SCENE_MIND_SPEAKING = false;
    window.SCENE_MIND_MOUTH = 0;
  }

  function speakChunk(text) {
    if (!ttsEnabled() || !text.trim()) return;
    const utter = new SpeechSynthesisUtterance(text);
    const chosen = voiceSelect && voices[Number(voiceSelect.value)];
    if (chosen) utter.voice = chosen;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.onstart = () => { window.SCENE_MIND_SPEAKING = true; };
    utter.onboundary = () => { window.SCENE_MIND_MOUTH = 1; }; // pulse per word
    const finish = () => {
      if (!synth.speaking && !synth.pending) {
        window.SCENE_MIND_SPEAKING = false;
        window.SCENE_MIND_MOUTH = 0;
      }
    };
    utter.onend = finish;
    utter.onerror = finish;
    synth.speak(utter);
  }

  // Speak any newly-completed sentences in `fullText`; on `done`, flush the rest.
  function speakProgress(fullText, done) {
    if (!ttsEnabled()) return;
    const pending = fullText.slice(spokenIdx);
    const sentence = /[^.!?\n]*[.!?\n]+/g;
    let match;
    let toSpeak = "";
    let consumed = 0;
    while ((match = sentence.exec(pending)) !== null) {
      toSpeak += match[0];
      consumed = sentence.lastIndex;
    }
    if (toSpeak) {
      speakChunk(toSpeak);
      spokenIdx += consumed;
    }
    if (done) {
      const rest = fullText.slice(spokenIdx);
      if (rest.trim()) speakChunk(rest);
      spokenIdx = fullText.length;
    }
  }

  // --- Speech-to-text + continuous conversation with barge-in -----------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;       // recognition currently active
  let conversationMode = false; // hands-free: keep listening, auto-send, barge-in
  let stopRequested = false;    // user explicitly stopped (don't auto-restart)

  function setMicUi(active) {
    if (!micBtn) return;
    micBtn.classList.toggle("listening", active);
    micBtn.textContent = active ? "Stop" : "Mic";
  }

  function startListening() {
    if (!recognition || listening) return;
    stopRequested = false;
    try {
      recognition.start();
    } catch (e) {
      /* start() throws if already running; ignore */
    }
  }

  function stopListening() {
    stopRequested = true;
    if (recognition && listening) recognition.stop();
  }

  function initRecognition() {
    if (!SpeechRecognition) {
      if (micBtn) micBtn.style.display = "none";
      if (convoToggle) convoToggle.closest(".form-check")?.style.setProperty("display", "none");
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      listening = true;
      setMicUi(true);
    };

    // Barge-in: as soon as the user starts talking, cut off the avatar's speech.
    recognition.onspeechstart = () => {
      if (window.SCENE_MIND_SPEAKING) resetSpeech();
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      // Ignore input captured while the avatar is speaking (likely its own echo),
      // unless the user has barged in (which already cleared SPEAKING).
      if (window.SCENE_MIND_SPEAKING) return;
      input.value = (final || interim).trim();
      const prompt = final.trim();
      if (prompt.length > 1) {
        input.value = "";
        sendMessage(prompt);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        statusEl.textContent = "Microphone permission denied.";
        conversationMode = false;
        if (convoToggle) convoToggle.checked = false;
      }
    };

    recognition.onend = () => {
      listening = false;
      setMicUi(false);
      // In conversation mode, keep the mic open unless the user stopped it.
      if (conversationMode && !stopRequested) startListening();
    };

    if (micBtn) {
      micBtn.addEventListener("click", () => {
        if (listening) stopListening();
        else startListening();
      });
    }

    if (convoToggle) {
      convoToggle.addEventListener("change", () => {
        conversationMode = convoToggle.checked;
        if (conversationMode) {
          statusEl.textContent = "Conversation mode on — just start talking.";
          startListening();
        } else {
          stopListening();
        }
      });
    }
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

  function renderAnswer(el, text) {
    if (window.SceneMindMarkdown) window.SceneMindMarkdown.renderInto(el, text);
    else el.textContent = text;
  }

  function handleFrame(payload, ctx) {
    if (payload.error) {
      ctx.pending.textContent = `⚠ ${payload.error}`;
      ctx.pending.classList.add("chat-error");
      ctx.failed = true;
      return;
    }
    if (payload.delta) {
      if (ctx.first) {
        ctx.pending.textContent = "";
        ctx.first = false;
      }
      ctx.answer += payload.delta;
      ctx.pending.textContent = ctx.answer; // raw while streaming (fast)
      log.scrollTop = log.scrollHeight;
      speakProgress(ctx.answer, false); // speak completed sentences as they arrive
    }
    if (payload.done) {
      ctx.answer = payload.answer || ctx.answer;
      statusEl.textContent = `via ${payload.provider} · ${payload.model}`;
      renderAnswer(ctx.pending, ctx.answer); // format once complete
      speakProgress(ctx.answer, true); // flush any trailing partial sentence
    }
  }

  async function sendMessage(prompt) {
    resetSpeech(); // stop any prior/queued speech before the new reply
    addBubble("user", prompt);
    setBusy(true);
    const pending = addBubble("assistant", "…");
    const ctx = { pending, answer: "", first: true, failed: false };
    try {
      const resp = await fetch("/api/chat/stream/", {
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
      if (!resp.ok || !resp.body) {
        const data = await resp.json().catch(() => ({}));
        pending.textContent = `⚠ ${data.error || "Request failed."}`;
        pending.classList.add("chat-error");
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!frame.startsWith("data:")) continue;
          try {
            handleFrame(JSON.parse(frame.slice(5).trim()), ctx);
          } catch (e) {
            /* ignore malformed frame */
          }
          if (ctx.failed) return;
        }
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
