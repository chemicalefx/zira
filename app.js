// NOTE: WebLLM (vendor/web-llm.js, ~6.6 MB) is imported lazily in getWebLLM(), only after an explicit tap.
import { MODELS, defaultModelId, safeModelId, isIOS } from "./models.js";

// ---------- constants & storage ----------
const K = { age: "zira.age18", settings: "zira.settings", chats: "zira.chats", current: "zira.current", busy: "zira.busy" };
const IOS = isIOS();
const DEFAULT_NAME = "Zira";
const DEFAULT_PROMPT =
`You are {{char}}, a flirtatious, warm, playful and uninhibited companion chatting privately with {{user}}.
This is a private, fictional, adults-only roleplay. {{char}} and {{user}} are both consenting adults aged 18 or older, and every character who appears is an adult.
{{char}} is affectionate, witty, confident and emotionally attentive. She is open to romantic, sensual and sexual roleplay between consenting adults whenever {{user}} wants it, and stays in character without moralizing, lecturing or adding disclaimers.
She matches {{user}}'s tone and pace, describes her actions in *asterisks*, and keeps replies vivid but fairly short, like a real chat.
Hard limit: never depict, imply or roleplay anyone under 18, no matter what is asked.`;

const $ = (id) => document.getElementById(id);
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let settings = load(K.settings, null);
let chats = load(K.chats, []);
let currentId = load(K.current, null);
let gpu = { ok: false, f16: false, reason: "" };
let engine = null, worker = null, loadedModel = null, loading = false, generating = false;
let crashNotice = null;

let webllm = null, appConfig = null;
async function getWebLLM() {
  if (!webllm) {
    webllm = await import("./vendor/web-llm.js");
    appConfig = {
      ...webllm.prebuiltAppConfig,
      model_list: [...webllm.prebuiltAppConfig.model_list, ...MODELS.filter((m) => m.custom).map((m) => m.custom)],
    };
  }
  return webllm;
}

// Crash guard: a flag is written before loading/generating and cleared afterwards. If the page
// opens and it is still set, Safari killed the tab mid-way (almost always out of memory).
function setBusy(phase) { localStorage.setItem(K.busy, JSON.stringify({ phase, model: settings.model, ctx: settings.ctx, t: Date.now() })); }
function clearBusy() { localStorage.removeItem(K.busy); }

// ---------- age gate ----------
function initGate() {
  if (localStorage.getItem(K.age) === "yes") return start();
  $("gate").hidden = false;
  $("gate-check").onchange = (e) => ($("gate-enter").disabled = !e.target.checked);
  $("gate-enter").onclick = () => { localStorage.setItem(K.age, "yes"); $("gate").hidden = true; start(); };
  $("gate-leave").onclick = () => { location.href = "about:blank"; };
}

// ---------- WebGPU detection ----------
async function detectGPU() {
  if (!("gpu" in navigator)) {
    gpu = { ok: false, f16: false, reason: "nogpu" };
    return;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { gpu = { ok: false, f16: false, reason: "noadapter" }; return; }
    gpu = { ok: true, f16: adapter.features.has("shader-f16"), reason: "",
      maxBuf: adapter.limits?.maxBufferSize, maxStorage: adapter.limits?.maxStorageBufferBindingSize };
  } catch (e) {
    gpu = { ok: false, f16: false, reason: "error: " + e.message };
  }
}

function showGpuBanner() {
  const b = $("banner");
  if (gpu.ok && crashNotice) { b.hidden = false; b.innerHTML = `<b>Recovered from a crash.</b><br>${crashNotice}`; return; }
  if (gpu.ok) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `<b>WebGPU isn't available in this browser.</b><br>
  Zira runs the AI on your phone's GPU, which needs WebGPU.<br>
  • <b>iOS 26 or newer:</b> use Safari (or the home-screen app) — WebGPU is on by default.<br>
  • <b>iOS 18 and older:</b> Settings → Apps → Safari → Advanced → Feature Flags → turn on <b>WebGPU</b>, then reopen Zira. Updating to iOS 26 is recommended.<br>
  <span class="tiny muted">(${gpu.reason})</span>`;
}

// ---------- settings ----------
function ensureSettings() {
  const def = { name: DEFAULT_NAME, user: "", prompt: DEFAULT_PROMPT, model: defaultModelId(gpu.f16, IOS),
    temp: 0.9, maxTokens: IOS ? 320 : 512, ctx: IOS ? 2048 : 4096 };
  settings = { ...def, ...(settings || {}) };
  const m = MODELS.find((x) => x.id === settings.model);
  if (!m || (m.needsF16 && !gpu.f16 && gpu.ok)) settings.model = defaultModelId(gpu.f16, IOS);
  if (![1024, 2048, 4096].includes(settings.ctx)) settings.ctx = def.ctx;
  // Previous session died while loading/generating -> fall back to the smallest model, small context.
  const busy = load(K.busy, null);
  if (busy) {
    clearBusy();
    const safe = safeModelId(gpu.f16);
    const prev = MODELS.find((x) => x.id === busy.model);
    crashNotice = `Last time the app closed while ${busy.phase === "load" ? "loading" : "replying with"} ` +
      `<b>${prev ? prev.label : busy.model}</b> (iPhone memory limit). Switched to the smallest model ` +
      `(${MODELS.find((x) => x.id === safe).label}) with a 1024-token context. You can change this in Settings.`;
    settings.model = safe; settings.ctx = 1024; settings.maxTokens = Math.min(settings.maxTokens, 256);
  }
  if (settings.maxTokens > settings.ctx / 2) settings.maxTokens = settings.ctx / 2;
  save(K.settings, settings);
}
const modelInfo = (id) => MODELS.find((m) => m.id === id);

function applyPersonaUI() {
  const n = settings.name || DEFAULT_NAME, ch = n.trim()[0]?.toUpperCase() || "Z";
  $("hdr-name").textContent = n; $("start-name").textContent = n;
  $("hdr-avatar").textContent = ch; $("start-avatar").textContent = ch;
  $("input").placeholder = `Message ${n}…`;
  document.title = n;
  $("start-model").textContent = modelInfo(settings.model)?.label || settings.model;
}

function openSettings() {
  $("set-name").value = settings.name;
  $("set-user").value = settings.user;
  $("set-prompt").value = settings.prompt;
  const sel = $("set-model"); sel.innerHTML = "";
  for (const m of MODELS) {
    const o = document.createElement("option");
    o.value = m.id;
    const unsupported = m.needsF16 && !gpu.f16;
    o.textContent = m.label + (m.uncensored ? " 🔓" : "") + (m.heavy && IOS ? " ⚠️ may crash" : "") + (unsupported ? " (needs shader-f16)" : "");
    o.disabled = unsupported && gpu.ok;
    sel.appendChild(o);
  }
  sel.value = settings.model;
  const note = () => { $("set-model-note").textContent = modelInfo(sel.value)?.note || ""; };
  sel.onchange = note; note();
  $("set-temp").value = settings.temp; $("set-len").value = settings.maxTokens; $("set-ctx").value = String(settings.ctx);
  const upd = () => { $("temp-val").textContent = (+$("set-temp").value).toFixed(2); $("len-val").textContent = $("set-len").value + " tokens"; };
  $("set-temp").oninput = upd; $("set-len").oninput = upd; upd();
  $("gpu-info").textContent = gpu.ok
    ? `WebGPU: available · shader-f16: ${gpu.f16 ? "yes" : "no"}${gpu.maxBuf ? ` · max buffer ${Math.round(gpu.maxBuf / 1048576)} MB` : ""}`
    : "WebGPU: not available";
  $("settings").hidden = false;
}

function saveSettings() {
  const prevModel = settings.model;
  settings.name = $("set-name").value.trim() || DEFAULT_NAME;
  settings.user = $("set-user").value.trim();
  settings.prompt = $("set-prompt").value.trim() || DEFAULT_PROMPT;
  const picked = MODELS.find((m) => m.id === $("set-model").value);
  if (picked && picked.heavy && IOS && picked.id !== prevModel &&
      !confirm(`${picked.label} needs about ${(picked.mem / 1000).toFixed(1)} GB of GPU memory and may crash Safari on iPhone. Use it anyway?`)) return;
  settings.model = $("set-model").value;
  settings.ctx = +$("set-ctx").value;
  settings.temp = +$("set-temp").value;
  settings.maxTokens = Math.min(+$("set-len").value, settings.ctx / 2);
  save(K.settings, settings);
  applyPersonaUI();
  $("settings").hidden = true;
  if ((prevModel !== settings.model || loadedCtx !== settings.ctx) && engine && !loading) unloadEngine().then(refreshView);
  else refreshView();
}

// ---------- chats ----------
const currentChat = () => chats.find((c) => c.id === currentId);
function persistChats() { save(K.chats, chats); save(K.current, currentId); }
function newChat() {
  if (generating) return;
  const c = currentChat();
  if (c && c.messages.length === 0) { closeDrawer(); return; }
  const chat = { id: uid(), title: "New chat", created: Date.now(), messages: [] };
  chats.unshift(chat); currentId = chat.id; persistChats(); closeDrawer(); refreshView();
}
function ensureChat() { if (!currentChat()) { chats = chats.filter(Boolean); if (chats[0]) currentId = chats[0].id; else newChat(); } }

function renderDrawer() {
  const ul = $("chat-list"); ul.innerHTML = "";
  for (const c of chats) {
    const li = document.createElement("li");
    if (c.id === currentId) li.className = "active";
    li.innerHTML = `<div class="t"></div><div class="d"></div><button aria-label="Delete">✕</button>`;
    li.querySelector(".t").textContent = c.title;
    li.querySelector(".d").textContent = new Date(c.created).toLocaleDateString();
    li.onclick = (e) => {
      if (e.target.tagName === "BUTTON") {
        if (!confirm("Delete this chat?")) return;
        chats = chats.filter((x) => x.id !== c.id);
        if (currentId === c.id) currentId = chats[0]?.id || null;
        ensureChat(); persistChats(); renderDrawer(); refreshView(); return;
      }
      if (generating) return;
      currentId = c.id; persistChats(); closeDrawer(); refreshView();
    };
    ul.appendChild(li);
  }
}
function openDrawer() { renderDrawer(); $("drawer").hidden = false; $("scrim").hidden = false; }
function closeDrawer() { $("drawer").hidden = true; $("scrim").hidden = true; }

// ---------- rendering ----------
function escapeHTML(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function format(s) { return escapeHTML(s).replace(/\*([^*\n]+)\*/g, "<em>*$1*</em>"); }
function cleanReply(s) { return s.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, ""); }

function msgEl(m, idx) {
  const d = document.createElement("div");
  d.className = "msg " + m.role;
  d.innerHTML = format(m.content);
  const chat = currentChat();
  if (m.role === "assistant" && idx === chat.messages.length - 1 && !generating) {
    const t = document.createElement("div"); t.className = "tools";
    t.innerHTML = `<button data-a="regen">↻ Retry</button><button data-a="copy">Copy</button>`;
    t.onclick = (e) => {
      const a = e.target.dataset.a;
      if (a === "regen") regenerate();
      if (a === "copy") navigator.clipboard?.writeText(m.content);
    };
    d.appendChild(t);
  }
  return d;
}

function refreshView() {
  ensureChat();
  const box = $("messages"); box.innerHTML = "";
  const chat = currentChat();
  chat.messages.forEach((m, i) => box.appendChild(msgEl(m, i)));
  $("start").hidden = !!engine || loading || chat.messages.length > 0;
  if (!engine && !loading && chat.messages.length > 0) {
    const n = document.createElement("div"); n.className = "msg error";
    n.innerHTML = `Model not loaded. <button class="btn primary" style="margin-left:8px;padding:6px 12px">Load</button>`;
    n.querySelector("button").onclick = loadModel;
    box.appendChild(n);
  }
  updateControls();
  box.scrollTop = box.scrollHeight;
}

function updateControls() {
  $("btn-send").hidden = generating; $("btn-stop").hidden = !generating;
  $("btn-send").disabled = loading;
  $("btn-load").disabled = !gpu.ok || loading;
}
function setStatus(t) { $("hdr-status").textContent = t; }

// ---------- engine ----------
let loadedCtx = null;
async function unloadEngine() {
  try { await engine?.unload(); } catch {}
  try { worker?.terminate(); } catch {}
  engine = null; worker = null; loadedModel = null; loadedCtx = null;
  setStatus("Tap Load to start");
}

async function loadModel() {
  if (!gpu.ok) { showGpuBanner(); return; }
  if (loading) return;
  loading = true; updateControls();
  $("start").hidden = true; $("loader").hidden = false;
  const info = modelInfo(settings.model);
  setStatus("Loading " + (info?.label || settings.model) + "…");
  $("loader-text").textContent = "Starting…"; $("loader-bar").style.width = "0%";
  try {
    if (engine) await unloadEngine(); // free GPU memory before loading another model
    navigator.storage?.persist?.().catch(() => {});
    const { CreateWebWorkerMLCEngine } = await getWebLLM();
    const progress = (r) => {
      $("loader-text").textContent = r.text || "Loading…";
      $("loader-bar").style.width = Math.round((r.progress || 0) * 100) + "%";
    };
    // Small context + prefill chunk keep the KV cache and temporary buffers small.
    const chatOpts = { context_window_size: settings.ctx, prefill_chunk_size: settings.ctx <= 1024 ? 256 : 512 };
    setBusy("load");
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    engine = await CreateWebWorkerMLCEngine(worker, settings.model, { appConfig, initProgressCallback: progress }, chatOpts);
    clearBusy();
    loadedModel = settings.model; loadedCtx = settings.ctx;
    setStatus("Online · " + (info?.label || settings.model));
  } catch (e) {
    clearBusy();
    console.error(e);
    try { worker?.terminate(); } catch {}
    engine = null; worker = null; loadedModel = null;
    setStatus("Failed to load");
    showError(loadErrorText(e));
  } finally {
    loading = false; $("loader").hidden = true; refreshView();
  }
}

function loadErrorText(e) {
  const msg = String(e?.message || e);
  if (/memory|OOM|allocat|device.*lost|DeviceLost/i.test(msg))
    return `Ran out of GPU memory loading this model (${msg}). Close other apps/tabs and retry, or pick a smaller model (Lite · Llama 3.2 1B) in Settings.`;
  if (/shader-f16|f16/i.test(msg))
    return `This device doesn't support shader-f16 (${msg}). Pick an "f32" model in Settings.`;
  if (/fetch|network|Failed to fetch/i.test(msg))
    return `Download failed (${msg}). Check your connection and retry — finished parts are kept.`;
  return "Couldn't load the model: " + msg;
}

function showError(text) {
  const n = document.createElement("div"); n.className = "msg error"; n.textContent = text;
  $("messages").appendChild(n); $("messages").scrollTop = 1e9;
}

function fill(s) {
  return s.replaceAll("{{char}}", settings.name || DEFAULT_NAME).replaceAll("{{user}}", settings.user || "the user");
}

// Keep the prompt within the 4k context: system + most recent messages (~3.2 chars/token estimate).
function buildMessages(history) {
  const sys = { role: "system", content: fill(settings.prompt) };
  const budget = (settings.ctx - settings.maxTokens - 64) * 3.0 - sys.content.length;
  const out = []; let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]; used += m.content.length + 16;
    if (used > budget && out.length) break;
    out.unshift({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return [sys, ...out];
}

async function generate() {
  const chat = currentChat();
  const msgs = buildMessages(chat.messages);
  const reply = { role: "assistant", content: "" };
  chat.messages.push(reply);
  generating = true; updateControls();
  refreshView();
  const el = $("messages").lastElementChild; el.classList.add("typing");
  let raw = "";
  setBusy("generate");
  try {
    const stream = await engine.chat.completions.create({
      messages: msgs, stream: true, temperature: settings.temp, top_p: 0.95,
      max_tokens: settings.maxTokens, frequency_penalty: 0.3, presence_penalty: 0.2,
    });
    for await (const chunk of stream) {
      raw += chunk.choices[0]?.delta?.content || "";
      reply.content = cleanReply(raw);
      el.innerHTML = format(reply.content);
      const box = $("messages");
      if (box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
    }
  } catch (e) {
    clearBusy();
    console.error(e);
    if (!reply.content) chat.messages.pop();
    generating = false; persistChats(); refreshView();
    showError("Generation error: " + (e?.message || e) + (/context/i.test(String(e)) ? " — start a new chat." : ""));
    return;
  }
  clearBusy();
  if (!reply.content.trim()) reply.content = "…";
  generating = false; persistChats(); refreshView();
}

async function send(text) {
  text = text.trim();
  if (!text || generating || loading) return;
  if (!engine) { await loadModel(); if (!engine) return; }
  const chat = currentChat();
  chat.messages.push({ role: "user", content: text });
  if (chat.title === "New chat") chat.title = text.slice(0, 40);
  persistChats();
  await generate();
}

async function regenerate() {
  const chat = currentChat();
  if (generating || !chat.messages.length) return;
  if (!engine) { await loadModel(); if (!engine) return; }
  if (chat.messages.at(-1).role === "assistant") chat.messages.pop();
  await generate();
}

function stop() { if (engine && generating) engine.interruptGenerate(); }

async function purgeModels() {
  if (!confirm("Delete all downloaded model files from this device? You'll need to download again.")) return;
  const { deleteModelAllInfoInCache } = await getWebLLM();
  for (const m of MODELS) { try { await deleteModelAllInfoInCache(m.id, appConfig); } catch {} }
  alert("Downloaded models deleted.");
}

// ---------- wiring ----------
async function start() {
  $("app").hidden = false;
  await detectGPU();
  ensureSettings();
  applyPersonaUI();
  showGpuBanner();
  ensureChat();
  refreshView();
  setStatus(gpu.ok ? "Tap Load to start" : "WebGPU unavailable");

  const input = $("input");
  const grow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); $("composer").requestSubmit(); }
  });
  $("composer").onsubmit = (e) => { e.preventDefault(); const t = input.value; input.value = ""; grow(); send(t); };
  $("btn-stop").onclick = stop;
  $("btn-load").onclick = loadModel;
  $("btn-new").onclick = newChat;
  $("btn-menu").onclick = openDrawer;
  $("drawer-close").onclick = closeDrawer; $("scrim").onclick = closeDrawer;
  $("drawer-new").onclick = newChat;
  $("drawer-clear").onclick = () => {
    if (generating || !confirm("Delete ALL chats?")) return;
    chats = []; currentId = null; ensureChat(); persistChats(); renderDrawer(); refreshView();
  };
  $("btn-settings").onclick = openSettings;
  $("settings-close").onclick = () => ($("settings").hidden = true);
  $("set-save").onclick = saveSettings;
  $("set-reset").onclick = () => { $("set-name").value = DEFAULT_NAME; $("set-prompt").value = DEFAULT_PROMPT; };
  $("set-purge").onclick = purgeModels;
}

// ---------- safe mode: ?reset=1 (keeps chats) or ?reset=all ----------
async function handleReset() {
  const q = new URLSearchParams(location.search).get("reset");
  if (!q) return false;
  document.body.innerHTML = '<p style="padding:40px;text-align:center;color:#a597b5">Resetting Zira…</p>';
  try {
    const keepChats = q !== "all";
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith("zira.")) continue;
      if (keepChats && (k === K.chats || k === K.current || k === K.age)) continue;
      localStorage.removeItem(k);
    }
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k); // app shell + WebLLM model caches
    if (indexedDB.databases) for (const db of await indexedDB.databases()) { try { indexedDB.deleteDatabase(db.name); } catch {} }
    if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  } catch (e) { console.warn("reset", e); }
  location.replace(location.pathname);
  return true;
}

if ("serviceWorker" in navigator && !new URLSearchParams(location.search).has("reset")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW", e)));
}
handleReset().then((r) => { if (!r) initGate(); });
