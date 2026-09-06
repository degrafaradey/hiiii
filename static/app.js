const tg = window.Telegram && window.Telegram.WebApp;
const INIT = (tg && tg.initData) || "";

if (tg) {
  tg.ready();
  tg.expand();
}

const el = (id) => document.getElementById(id);
const screens = {
  intro: el("screen-intro"),
  asking: el("screen-question"),
  verdict: el("screen-verdict"),
  pending: el("screen-pending"),
  finished: el("screen-final"),
  error: el("screen-error"),
};

const action = el("action");
const secondary = el("secondary");
const answerInput = el("answer");
const notice = el("notice");

let state = null;
let poller = null;
let busy = false;
let moneyPlayed = false;

/* ---------- сеть ---------- */

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Init-Data": INIT },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Что-то пошло не так. Попробуй ещё раз.");
  return data;
}

function buzz(type) {
  if (!tg || !tg.HapticFeedback) return;
  try { tg.HapticFeedback.notificationOccurred(type); } catch (e) { /* нет вибро */ }
}

/* ---------- отрисовка ---------- */

function drawBeads(total, step, status) {
  const beads = el("beads");
  if (beads.childElementCount !== total) {
    beads.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const b = document.createElement("i");
      b.className = "bead";
      beads.appendChild(b);
    }
  }
  [...beads.children].forEach((b, i) => {
    const done = status === "finished" || i < step || (status === "verdict" && i === step);
    b.className = "bead" + (done ? " done" : i === step && status !== "finished" ? " now" : "");
  });
}

function show(name) {
  Object.entries(screens).forEach(([key, node]) => { node.hidden = key !== name; });
}

/* ---------- темы по экранам ---------- */

const THEMES = ["blue", "orange", "antique", "aero", "y2k", "aero"];
const THEME_BG = {
  blue: "#06070b",
  orange: "#efeae0",
  antique: "#0c0e18",
  aero: "#4a9ee8",
  y2k: "#4a9bff",
};

let lastTheme = null;

function themeFor(s) {
  if (s.status === "intro") return "blue";
  if (s.status === "finished") return "y2k";
  if (s.status === "error") return lastTheme || "blue";
  return THEMES[s.step] || "blue";
}

function applyTheme(s) {
  const name = themeFor(s);
  lastTheme = name;
  const cls = document.body.classList;
  Object.keys(THEME_BG).forEach((t) => cls.remove("theme-" + t));
  cls.add("theme-" + name);
  cls.toggle("blue-intro", s.status === "intro");
  if (tg) {
    try {
      tg.setHeaderColor(THEME_BG[name]);
      tg.setBackgroundColor(THEME_BG[name]);
    } catch (e) { /* старые клиенты */ }
  }
}

function render(next) {
  state = next;
  const status = state.status;

  el("thread").hidden = status === "intro" || status === "error";
  if (!el("thread").hidden) drawBeads(state.total, state.step, status);

  secondary.hidden = true;
  action.hidden = false;
  action.disabled = false;

  applyTheme(state);

  if (status === "intro") {
    Scenes.enter("intro", state.welcome_notes);
    const title = el("welcome-title");
    title.innerHTML = "";
    (state.welcome_title || []).forEach((part, i) => {
      if (i) title.appendChild(document.createElement("br"));
      title.appendChild(document.createTextNode(part));
    });
    el("welcome-latin").textContent = state.welcome_latin || "";
    el("welcome").textContent = state.welcome;
    action.textContent = "Иду дальше";
    show("intro");
  }

  if (status === "asking") {
    const q = state.question;
    Scenes.enter(q.index);
    el("q-num").textContent = `Вопрос ${q.number} из ${state.total}`;
    el("q-text").textContent = q.text;
    renderMedia(q);
    action.textContent = "Ответить";
    show("asking");
    setTimeout(() => answerInput.focus({ preventScroll: true }), 60);
  }

  if (status === "verdict") {
    el("verdict-text").innerHTML = state.message;
    action.textContent = state.last ? "Забрать сюрприз" : "Дальше";
    show("verdict");
  }

  if (status === "pending") {
    el("pending-text").textContent = state.message;
    action.hidden = true;
    secondary.hidden = false;
    show("pending");
  }

  if (status === "finished") {
    Scenes.leave();
    el("final-text").innerHTML = state.final.text;
    if (state.final.image) {
      el("prize-img").src = state.final.image;
      el("prize-caption").textContent = state.final.caption;
      el("prize-box").hidden = false;
    }
    action.textContent = "Закрыть";
    show("finished");
    buzz("success");
    if (!moneyPlayed) {
      moneyPlayed = true;
      playMoney();
    }
  }

  if (status === "error") {
    Scenes.leave();
    el("error-text").textContent = state.message;
    action.hidden = true;
    show("error");
  }

  status === "pending" ? startPolling() : stopPolling();
}

function renderMedia(q) {
  const box = el("q-media");
  box.innerHTML = "";
  box.hidden = true;
  if (q.photo) {
    const img = document.createElement("img");
    img.src = q.photo;
    img.alt = "";
    box.appendChild(img);
    box.hidden = false;
  } else if (q.video) {
    const v = document.createElement("video");
    v.src = q.video;
    v.controls = true;
    v.playsInline = true;
    box.appendChild(v);
    box.hidden = false;
  }
}

function setNotice(text) {
  notice.hidden = !text;
  if (text) notice.textContent = text;
}

/* ---------- ожидание вердикта админа ---------- */

function startPolling() {
  if (poller) return;
  poller = setInterval(async () => {
    try {
      const next = await api("/api/state");
      if (next.status !== "pending") {
        if (next.status === "verdict") buzz("success");
        render(next);
      }
    } catch (e) { /* сеть моргнула — попробуем в следующий раз */ }
  }, 3000);
}

function stopPolling() {
  if (poller) { clearInterval(poller); poller = null; }
}

/* ---------- действия ---------- */

async function guarded(fn) {
  if (busy) return;
  busy = true;
  action.disabled = true;
  try {
    await fn();
  } catch (e) {
    setNotice(e.message);
    buzz("error");
  } finally {
    busy = false;
    action.disabled = false;
  }
}

action.addEventListener("click", () => guarded(async () => {
  if (state.status === "intro") {
    render(await api("/api/start", "POST"));
    return;
  }

  if (state.status === "asking") {
    const text = answerInput.value;
    const res = await api("/api/answer", "POST", { answer: text });

    if (res.result === "retry" || res.result === "empty") {
      setNotice(res.notice);
      buzz("error");
      answerInput.select();
      return;
    }

    answerInput.value = "";
    answerInput.style.height = "auto";
    setNotice("");
    if (res.result === "correct") buzz("success");
    if (res.result === "pending") buzz("warning");
    render(res.state);
    return;
  }

  if (state.status === "verdict") {
    const leaving = state.step;
    const next = await api("/api/next", "POST");

    // после ответа про Хауса — видео с Форманом и резкий переход
    if (leaving === 1) await playTransitionVideo(MEDIA.foremanVideo);

    // перед вопросом про Хауса — крестики-нолики
    if (next.status === "asking" && next.step === 1) await playMinigame();

    render(next);
    return;
  }

  if (state.status === "finished" && tg) tg.close();
}));

secondary.addEventListener("click", () => guarded(async () => {
  setNotice("");
  render(await api("/api/cancel", "POST"));
}));

answerInput.addEventListener("input", () => {
  answerInput.style.height = "auto";
  answerInput.style.height = Math.min(answerInput.scrollHeight, 200) + "px";
  Scenes.type(answerInput.value);
});

/* ---------- старт ---------- */

(async () => {
  try {
    render(await api("/api/state"));
  } catch (e) {
    render({ status: "error", total: 0, step: 0, message: e.message });
  }
})();
