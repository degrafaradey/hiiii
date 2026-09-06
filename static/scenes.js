/* ============================================================
   СЦЕНЫ КВИЗА

   Куда класть файлы: папка media/ рядом с app.py.
   Любого файла может не быть — сцена нарисуется и без него.
   ============================================================ */

const MEDIA = {
  epic:         "/media/epic.jpg",     // фон вопроса про Одиссею (проявляется из песка)
  foreman:      "/media/foreman.jpg",  // фото Формана
  foremanVideo: "/media/foreman.mp4",  // видео после ответа про Хауса
  trio:         "/media/trio.jpg",     // фото Артёма, Ани и Саши
  iam:          "/media/iam.mp4",      // видео-фон вопроса «I am?...»
  house:        "/media/house.png",    // голова Хауса для крестиков-ноликов
  wilson:       "/media/wilson.png",   // голова Уилсона
};

/* Реплики троицы. Позиции в процентах — подгони под свою фотку. */
const TRIO_LINES = [
  { who: "Артём", text: "Вика вообще топчик, я вам просто напоминаю", x: 5,  y: 12 },
  { who: "Аня",   text: "Да я это с самого начала говорила!!",         x: 40, y: 38 },
  { who: "Саша",  text: "Три часа экономики. Три. Часа.",              x: 8,  y: 62 },
  { who: "Артём", text: "ВОТ ИМЕННО. Умница же",                       x: 44, y: 82 },
];

/* Фразы, которые пролетают и складываются в стену на первом вопросе */
const WALL_PHRASES = [
  "ты умничка!",
  "я горжусь тобой!",
  "ты многое достигла!",
  "закл будет твоим",
  "ты умеешь больше, чем думаешь",
  "эти три часа не зря",
  "ты возвращаешься в темп",
  "я верю в тебя",
  "олимпиада тебя не переиграет",
  "ты сильнее вчерашней себя",
];

const WALL_TOKENS = [
  "ты", "умничка", "горжусь", "закл", "сможешь", "верю",
  "сила", "топ", "дожмёшь", "моя", "умница", "рядом",
];

const WALL_MESSAGE = ["у тебя", "всё", "получится,", "и ты знаешь,", "о чём я"];

/* Что Форман говорит, пока она печатает */
const FOREMAN_LINES = {
  start:  ["Ну?", "Я жду.", "Смелее."],
  short:  ["Это пока не ответ.", "Продолжай.", "Ещё чуть-чуть."],
  medium: ["Уже теплее.", "Хм.", "Ладно, слушаю."],
  long:   ["Короче можно было.", "Ты уверена, что всё это нужно?"],
  me:     ["Наконец-то кто-то вспомнил про меня.", "Восемь сезонов, и никто не спрашивал."],
  house:  ["Опять Хаус. У него, между прочим, я продержался дольше всех.", "Хаус бы такого не сказал."],
  others: ["Не тот. Они все уходили.", "Этот увольнялся. Я — нет."],
  ask:    ["Я не подсказываю.", "Спроси у Уилсона."],
};

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- мелкие помощники ---------- */

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function videoExists(src) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve(true);
    v.onerror = () => resolve(false);
    v.src = src;
  });
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function veil(node) {
  const v = document.createElement("div");
  v.className = "scene-veil";
  node.appendChild(v);
}

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // размер берём один раз и фиксируем в пикселях: когда вылезает клавиатура,
  // окно становится ниже, и холст должен обрезаться, а не растягиваться
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: w, h: h };
}

/* ============================================================
   Вопрос 1 — фразы пролетают мимо друг друга и складываются
   в стену, а на отдалении стена читается как одно предложение
   ============================================================ */

function sceneWall(root) {
  const canvas = document.createElement("canvas");
  canvas.className = "scene-canvas";
  root.appendChild(canvas);

  let raf = null;
  const { ctx, w, h } = fitCanvas(canvas);

  /* --- стена рисуется один раз в закадровый холст --- */
  const WW = 1100;
  const HH = Math.round(Math.min(2600, Math.max(900, WW * (h / w))));

  const wall = document.createElement("canvas");
  wall.width = WW;
  wall.height = HH;
  const wctx = wall.getContext("2d");

  // маска: сообщение, набранное крупно
  const mask = document.createElement("canvas");
  mask.width = Math.round(WW / 2);
  mask.height = Math.round(HH / 2);
  const mctx = mask.getContext("2d");
  mctx.fillStyle = "#fff";
  mctx.textAlign = "center";
  mctx.textBaseline = "middle";

  const lineH = mask.height / (WALL_MESSAGE.length + 1.2);
  let fs = lineH * 0.92;
  mctx.font = '600 ' + fs + 'px "Cormorant Garamond", Georgia, serif';
  const widest = Math.max.apply(null, WALL_MESSAGE.map((l) => mctx.measureText(l).width));
  const limit = mask.width * 0.9;
  if (widest > limit) {
    fs = fs * (limit / widest);
    mctx.font = '600 ' + fs + 'px "Cormorant Garamond", Georgia, serif';
  }
  const top = (mask.height - WALL_MESSAGE.length * lineH) / 2 + lineH / 2;
  WALL_MESSAGE.forEach((l, i) => mctx.fillText(l, mask.width / 2, top + i * lineH));

  const maskData = mctx.getImageData(0, 0, mask.width, mask.height).data;
  function inside(x, y) {
    const mx = Math.round((x / WW) * mask.width);
    const my = Math.round((y / HH) * mask.height);
    if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height) return false;
    return maskData[(my * mask.width + mx) * 4 + 3] > 110;
  }

  // плитки-слова
  const tiles = [];
  const xStep = 21;
  const yStep = 15;
  for (let y = yStep; y < HH; y += yStep) {
    for (let x = 6; x < WW; x += xStep) {
      const on = inside(x, y);
      if (!on && Math.random() > 0.26) continue;
      tiles.push({ x: x, y: y, on: on, word: pick(WALL_TOKENS) });
    }
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
  }

  let drawn = 0;
  function growWall(count) {
    wctx.textBaseline = "middle";
    for (let i = 0; i < count && drawn < tiles.length; i++, drawn++) {
      const t = tiles[drawn];
      wctx.font = t.on
        ? '600 11px "Golos Text", system-ui, sans-serif'
        : '400 10px "Golos Text", system-ui, sans-serif';
      wctx.fillStyle = t.on
        ? (Math.random() < 0.18 ? "rgba(233,197,140,0.95)" : "rgba(233,121,155,0.92)")
        : "rgba(247,239,243,0.11)";
      wctx.fillText(t.word, t.x, t.y);
    }
  }

  /* --- фразы, которые пролетают мимо --- */
  const flyers = WALL_PHRASES.map((text, i) => ({
    text: text,
    x: rnd(-0.42, 0.42),
    y: rnd(-0.4, 0.4),
    start: 120 + i * 250 + rnd(-80, 80),
    life: rnd(2100, 2900),
  }));

  const T_WALL = 2500;   // стена начинает собираться
  const T_ZOOM = 6100;   // камера отъезжает
  const T_END = 10600;

  const fit = (w / WW) * 0.98;
  const zoomFrom = fit * 3.4;

  let t0 = null;

  function frame(now) {
    if (t0 === null) t0 = now;
    const t = now - t0;

    ctx.clearRect(0, 0, w, h);

    if (t < T_WALL + 1600) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < flyers.length; i++) {
        const f = flyers[i];
        const p = (t - f.start) / f.life;
        if (p <= 0 || p >= 1) continue;
        const z = 1 - p;
        const k = 0.16 / Math.max(z, 0.02);
        const size = Math.min(140, 15 * k);
        const alpha = Math.min(1, p * 4) * Math.max(0, 1 - Math.pow(p, 3.2)) * 0.85;
        ctx.font = '500 ' + size + 'px "Cormorant Garamond", Georgia, serif';
        ctx.fillStyle = "rgba(247,239,243," + alpha + ")";
        ctx.fillText(f.text, w / 2 + f.x * w * k * 2.6, h / 2 + f.y * h * k * 2.6);
      }
    }

    if (t > T_WALL) {
      if (drawn < tiles.length) growWall(90);

      let scale, alpha;
      if (t < T_ZOOM) {
        scale = zoomFrom;
        alpha = Math.min(1, (t - T_WALL) / 1400);
      } else {
        const p = Math.min(1, (t - T_ZOOM) / (T_END - T_ZOOM));
        scale = zoomFrom + (fit - zoomFrom) * easeInOut(p);
        alpha = 1;
      }

      const dw = WW * scale;
      const dh = HH * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(wall, 0, 0, WW, HH, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }

    if (t < T_END + 600) {
      raf = requestAnimationFrame(frame);
    } else {
      canvas.style.transition = "opacity 2.2s ease";
      canvas.style.opacity = "0.42";
      raf = null;
    }
  }

  if (REDUCED) {
    growWall(tiles.length);
    const dw = WW * fit, dh = HH * fit;
    ctx.drawImage(wall, 0, 0, WW, HH, (w - dw) / 2, (h - dh) / 2, dw, dh);
    canvas.style.opacity = "0.42";
  } else {
    raf = requestAnimationFrame(frame);
  }

  return { destroy: function () { if (raf) cancelAnimationFrame(raf); } };
}

/* ============================================================
   Вопрос 2 — Форман на фоне, реагирует на набранный текст
   ============================================================ */

function sceneForeman(root) {
  const holder = document.createElement("div");
  holder.className = "scene-photo breathe";
  holder.style.backgroundSize = "cover";
  holder.style.backgroundPosition = "center";
  root.appendChild(holder);
  veil(root);

  loadImage(MEDIA.foreman).then(function (img) {
    if (img) holder.style.backgroundImage = "url(" + MEDIA.foreman + ")";
    else holder.style.background = "radial-gradient(70% 60% at 50% 35%, #3a2a44, #17101f 75%)";
  });

  const line = document.createElement("div");
  line.className = "reactor";
  root.appendChild(line);

  let last = "";
  let timer = null;

  function say(text) {
    if (!text || text === last) return;
    last = text;
    line.classList.remove("on");
    setTimeout(function () {
      line.textContent = text;
      line.classList.add("on");
    }, 180);
  }

  function reactTo(raw) {
    const t = (raw || "").toLowerCase();
    if (!t.trim()) {
      line.classList.remove("on");
      last = "";
      return;
    }
    if (t.indexOf("форман") >= 0 || t.indexOf("foreman") >= 0) return say(pick(FOREMAN_LINES.me));
    if (t.indexOf("хаус") >= 0 || t.indexOf("house") >= 0) return say(pick(FOREMAN_LINES.house));
    if (/чейз|кэмерон|кемерон|тауб|тринадцат|кадди|мастерс|парк/.test(t)) {
      return say(pick(FOREMAN_LINES.others));
    }
    if (t.indexOf("?") >= 0) return say(pick(FOREMAN_LINES.ask));
    if (t.length <= 3) return say(pick(FOREMAN_LINES.start));
    if (t.length <= 12) return say(pick(FOREMAN_LINES.short));
    if (t.length <= 45) return say(pick(FOREMAN_LINES.medium));
    return say(pick(FOREMAN_LINES.long));
  }

  return {
    onType: function (text) {
      clearTimeout(timer);
      timer = setTimeout(function () { reactTo(text); }, 260);
    },
    destroy: function () { clearTimeout(timer); },
  };
}

/* ============================================================
   Вопрос 3 — фон проявляется из песчинок, от краёв к центру
   ============================================================ */

function sceneSand(root) {
  const canvas = document.createElement("canvas");
  canvas.className = "scene-canvas";
  root.appendChild(canvas);
  veil(root);

  let raf = null;
  const fitted = fitCanvas(canvas);
  const ctx = fitted.ctx, w = fitted.w, h = fitted.h;

  const source = document.createElement("canvas");
  source.width = Math.round(w);
  source.height = Math.round(h);
  const sctx = source.getContext("2d");

  function drawFallback() {
    const g = sctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2b1f38");
    g.addColorStop(0.45, "#6b4a4f");
    g.addColorStop(0.72, "#c08a63");
    g.addColorStop(1, "#e0b483");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, w, h);
    const sun = sctx.createRadialGradient(w * 0.5, h * 0.36, 0, w * 0.5, h * 0.36, w * 0.42);
    sun.addColorStop(0, "rgba(255,214,160,0.85)");
    sun.addColorStop(1, "rgba(255,214,160,0)");
    sctx.fillStyle = sun;
    sctx.fillRect(0, 0, w, h);
  }

  function start(img) {
    if (img) {
      const r = Math.max(w / img.width, h / img.height);
      const dw = img.width * r, dh = img.height * r;
      sctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      drawFallback();
    }

    if (REDUCED) {
      ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, w, h);
      return;
    }

    const data = sctx.getImageData(0, 0, source.width, source.height).data;
    const step = 8;
    const cx = w / 2, cy = h / 2;
    const maxD = Math.hypot(cx, cy);

    let active = [];
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = ((y | 0) * source.width + (x | 0)) * 4;
        const d = Math.hypot(x - cx, y - cy);
        const ang = Math.atan2(y - cy, x - cx);
        const push = maxD * rnd(0.65, 1.25);
        active.push({
          x: x, y: y,
          sx: cx + Math.cos(ang) * push + rnd(-40, 40),
          sy: cy + Math.sin(ang) * push + rnd(-40, 40),
          c: "rgb(" + data[i] + "," + data[i + 1] + "," + data[i + 2] + ")",
          // край прилетает первым, центр — последним
          delay: (1 - d / maxD) * 3600 + rnd(0, 500),
          dur: rnd(1100, 1800),
        });
      }
    }

    const settled = document.createElement("canvas");
    settled.width = source.width;
    settled.height = source.height;
    const setctx = settled.getContext("2d");

    let t0 = null;

    function frame(now) {
      if (t0 === null) t0 = now;
      const t = now - t0;

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(settled, 0, 0, settled.width, settled.height, 0, 0, w, h);

      const still = [];
      for (let i = 0; i < active.length; i++) {
        const g = active[i];
        const p = (t - g.delay) / g.dur;
        if (p <= 0) { still.push(g); continue; }
        if (p >= 1) {
          setctx.fillStyle = g.c;
          setctx.fillRect(g.x, g.y, step, step);
          continue;
        }
        const e = easeOut(p);
        ctx.globalAlpha = Math.min(1, p * 2.4);
        ctx.fillStyle = g.c;
        ctx.fillRect(g.sx + (g.x - g.sx) * e, g.sy + (g.y - g.sy) * e, step * 0.9, step * 0.9);
        still.push(g);
      }
      ctx.globalAlpha = 1;
      active = still;

      raf = active.length ? requestAnimationFrame(frame) : null;
    }

    raf = requestAnimationFrame(frame);
  }

  loadImage(MEDIA.epic).then(start);

  return { destroy: function () { if (raf) cancelAnimationFrame(raf); } };
}

/* ============================================================
   Вопрос 4 — фото троицы и реплики про Вику
   ============================================================ */

function sceneTrio(root) {
  const holder = document.createElement("div");
  holder.className = "scene-photo breathe";
  holder.style.backgroundSize = "cover";
  holder.style.backgroundPosition = "center";
  root.appendChild(holder);
  veil(root);

  loadImage(MEDIA.trio).then(function (img) {
    if (img) {
      holder.style.backgroundImage = "url(" + MEDIA.trio + ")";
    } else {
      holder.style.background = "radial-gradient(70% 60% at 50% 30%, #3a2a44, #17101f 75%)";
      const faces = document.createElement("div");
      faces.className = "faces";
      ["А", "А", "С"].forEach(function (ch) {
        const f = document.createElement("div");
        f.className = "face";
        f.textContent = ch;
        faces.appendChild(f);
      });
      holder.appendChild(faces);
    }
  });

  const bubbles = TRIO_LINES.map(function (l) {
    const b = document.createElement("div");
    b.className = "bubble";
    b.style.left = l.x + "%";
    b.style.top = l.y + "%";
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = l.who;
    const txt = document.createElement("span");
    txt.textContent = l.text;
    b.appendChild(who);
    b.appendChild(txt);
    root.appendChild(b);
    return b;
  });

  const timers = [];
  function run() {
    bubbles.forEach(function (b, i) {
      timers.push(setTimeout(function () { b.classList.add("on"); }, 500 + i * 1300));
    });
    timers.push(setTimeout(function () {
      bubbles.forEach(function (b) { b.classList.remove("on"); });
      timers.push(setTimeout(run, 1200));
    }, 500 + bubbles.length * 1300 + 4500));
  }

  if (REDUCED) bubbles.forEach(function (b) { b.classList.add("on"); });
  else run();

  return { destroy: function () { timers.forEach(clearTimeout); } };
}

/* ============================================================
   Вопрос 6 — видео на фоне
   ============================================================ */

function sceneVideo(root, src) {
  const v = document.createElement("video");
  v.className = "scene-video";
  v.src = src;
  v.muted = true;
  v.loop = true;
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("muted", "");
  v.onerror = function () { v.remove(); };
  root.appendChild(v);
  veil(root);
  const p = v.play();
  if (p && p.catch) p.catch(function () {});
  return { destroy: function () { v.pause(); } };
}

/* ============================================================
   Менеджер сцен
   ============================================================ */

const BUILDERS = {
  0: sceneWall,
  1: sceneForeman,
  2: sceneSand,
  3: sceneTrio,
  5: function (root) { return sceneVideo(root, MEDIA.iam); },
};

const Scenes = {
  current: null,
  currentIndex: null,

  enter: function (index) {
    if (this.currentIndex === index) return;
    this.leave();
    const build = BUILDERS[index];
    if (!build) return;

    const root = document.createElement("div");
    root.className = "scene";
    document.getElementById("scene").appendChild(root);

    this.current = build(root) || {};
    this.current.root = root;
    this.currentIndex = index;
    requestAnimationFrame(function () { root.classList.add("on"); });
  },

  leave: function () {
    if (!this.current) return;
    const root = this.current.root;
    if (this.current.destroy) this.current.destroy();
    root.classList.remove("on");
    setTimeout(function () { root.remove(); }, 900);
    this.current = null;
    this.currentIndex = null;
  },

  type: function (text) {
    if (this.current && this.current.onType) this.current.onType(text);
  },
};

/* ============================================================
   Мини-игра: Хаус против Уилсона
   ============================================================ */

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winnerOf(b) {
  for (let i = 0; i < WIN_LINES.length; i++) {
    const l = WIN_LINES[i];
    if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { mark: b[l[0]], line: l };
  }
  return b.every(Boolean) ? { mark: "draw", line: null } : null;
}

function minimax(b, turn, ai, depth) {
  const res = winnerOf(b);
  if (res) {
    if (res.mark === "draw") return 0;
    return res.mark === ai ? 10 - depth : depth - 10;
  }
  let best = turn === ai ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const s = minimax(b, turn === "h" ? "w" : "h", ai, depth + 1);
    b[i] = null;
    best = turn === ai ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

function aiMove(b, ai) {
  const free = [];
  for (let i = 0; i < 9; i++) if (!b[i]) free.push(i);
  if (!free.length) return -1;
  if (Math.random() < 0.28) return pick(free);  // иногда ошибается, чтобы можно было выиграть
  let bestScore = -Infinity, bestIdx = free[0];
  for (let k = 0; k < free.length; k++) {
    const i = free[k];
    b[i] = ai;
    const s = minimax(b, ai === "h" ? "w" : "h", ai, 0);
    b[i] = null;
    if (s > bestScore) { bestScore = s; bestIdx = i; }
  }
  return bestIdx;
}

function markNode(mark, faces) {
  if (faces[mark]) {
    const img = document.createElement("img");
    img.src = faces[mark];
    img.alt = "";
    return img;
  }
  const span = document.createElement("span");
  span.className = "glyph " + mark;
  span.textContent = mark === "h" ? "✕" : "◯";
  return span;
}

function playMinigame() {
  return new Promise(function (resolve) {
    const overlay = document.getElementById("overlay");
    overlay.innerHTML = "";
    overlay.classList.add("on");

    const faces = {};

    function done() {
      overlay.classList.remove("on");
      overlay.innerHTML = "";
      resolve();
    }

    function avatar(mark) {
      const box = document.createElement("div");
      box.className = "avatar";
      box.appendChild(markNode(mark, faces));
      return box;
    }

    function renderChoice() {
      const ov = document.createElement("div");
      ov.className = "ov";

      const h3 = document.createElement("h3");
      h3.textContent = "Перед следующим вопросом выбери, за кого играешь";
      ov.appendChild(h3);

      const p = document.createElement("p");
      p.textContent = "Три в ряд. Ходишь первой.";
      ov.appendChild(p);

      const sides = document.createElement("div");
      sides.className = "sides";

      [["h", "Хаус", "крестик"], ["w", "Уилсон", "нолик"]].forEach(function (item) {
        const btn = document.createElement("button");
        btn.className = "side";
        btn.type = "button";
        btn.appendChild(avatar(item[0]));
        const t = document.createElement("span");
        t.textContent = item[1];
        btn.appendChild(t);
        const s = document.createElement("span");
        s.className = "mark";
        s.textContent = item[2];
        btn.appendChild(s);
        btn.onclick = function () {
          btn.classList.add("picked");
          setTimeout(function () { renderBoard(item[0]); }, 260);
        };
        sides.appendChild(btn);
      });

      ov.appendChild(sides);

      const skip = document.createElement("button");
      skip.className = "ghost";
      skip.type = "button";
      skip.textContent = "Пропустить игру";
      skip.onclick = done;
      ov.appendChild(skip);

      overlay.appendChild(ov);
    }

    function renderBoard(me) {
      const ai = me === "h" ? "w" : "h";
      const board = new Array(9).fill(null);
      let locked = false;

      overlay.innerHTML = "";
      const ov = document.createElement("div");
      ov.className = "ov";

      const title = document.createElement("h3");
      title.textContent = me === "h" ? "Ты — Хаус" : "Ты — Уилсон";
      ov.appendChild(title);

      const hint = document.createElement("p");
      hint.textContent = "Собери три в ряд.";
      ov.appendChild(hint);

      const grid = document.createElement("div");
      grid.className = "board";
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const c = document.createElement("button");
        c.className = "cell";
        c.type = "button";
        (function (idx) { c.onclick = function () { human(idx); }; })(i);
        grid.appendChild(c);
        cells.push(c);
      }
      ov.appendChild(grid);

      const line = document.createElement("p");
      line.className = "verdict-line";
      ov.appendChild(line);

      const next = document.createElement("button");
      next.className = "action";
      next.type = "button";
      next.textContent = "К вопросу";
      next.hidden = true;
      next.onclick = done;
      ov.appendChild(next);

      overlay.appendChild(ov);

      function put(i, mark) {
        board[i] = mark;
        cells[i].appendChild(markNode(mark, faces));
        cells[i].disabled = true;
      }

      function finish(res) {
        locked = true;
        cells.forEach(function (c) { c.disabled = true; });
        if (res.line) res.line.forEach(function (i) { cells[i].classList.add("win"); });
        if (res.mark === "draw") line.textContent = "Ничья. Как обычно у них двоих.";
        else if (res.mark === me) line.textContent = "Ты выиграла. Разумеется.";
        else line.textContent = "В этот раз не твоё поле. Ничего.";
        next.hidden = false;
      }

      function human(i) {
        if (locked || board[i]) return;
        put(i, me);
        let res = winnerOf(board);
        if (res) return finish(res);
        locked = true;
        setTimeout(function () {
          const j = aiMove(board, ai);
          if (j >= 0) put(j, ai);
          const r = winnerOf(board);
          if (r) finish(r);
          else locked = false;
        }, 420);
      }
    }

    Promise.all([loadImage(MEDIA.house), loadImage(MEDIA.wilson)]).then(function (r) {
      if (r[0]) faces.h = MEDIA.house;
      if (r[1]) faces.w = MEDIA.wilson;
      renderChoice();
    });
  });
}

/* ============================================================
   Видео-переход после ответа про Хауса
   ============================================================ */

function playTransitionVideo(src) {
  return new Promise(function (resolve) {
    videoExists(src).then(function (ok) {
      if (!ok) return resolve();

      const overlay = document.getElementById("overlay");
      overlay.innerHTML = "";
      overlay.classList.add("on");

      const v = document.createElement("video");
      v.className = "ov-video";
      v.src = src;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      overlay.appendChild(v);

      const skip = document.createElement("button");
      skip.className = "skip";
      skip.type = "button";
      skip.textContent = "дальше";
      overlay.appendChild(skip);

      let closed = false;
      function close() {
        if (closed) return;
        closed = true;
        v.pause();
        overlay.classList.remove("on");   // резкий обрыв, без затухания
        overlay.innerHTML = "";
        resolve();
      }

      v.onended = close;
      v.onerror = close;
      skip.onclick = close;
      setTimeout(close, 20000);           // страховка, если видео зависло
      const p = v.play();
      if (p && p.catch) p.catch(close);
    });
  });
}

/* ============================================================
   Финал: объёмная надпись 1111 ₽
   ============================================================ */

function playMoney() {
  return new Promise(function (resolve) {
    const overlay = document.getElementById("overlay");
    overlay.innerHTML = "";
    overlay.classList.add("on");

    const stage = document.createElement("div");
    stage.className = "money-stage";

    const drift = document.createElement("div");
    drift.className = "money-drift";

    const money = document.createElement("div");
    money.className = "money";

    const DEPTH = 16;                       // объём: копии, уходящие вглубь
    for (let i = DEPTH; i > 0; i--) {
      const layer = document.createElement("div");
      layer.className = "layer";
      layer.textContent = "1111 ₽";
      const k = i / DEPTH;
      layer.style.transform = "translateZ(" + (-i * 3) + "px)";
      layer.style.color = "rgb(" + Math.round(120 - 60 * k) + "," +
                                   Math.round(60 - 30 * k) + "," +
                                   Math.round(80 - 40 * k) + ")";
      money.appendChild(layer);
    }

    const front = document.createElement("div");
    front.className = "front";
    front.textContent = "1111 ₽";
    money.appendChild(front);

    drift.appendChild(money);
    stage.appendChild(drift);

    for (let i = 0; i < 14; i++) {
      const s = document.createElement("i");
      s.className = "spark";
      s.style.left = rnd(6, 94) + "%";
      s.style.top = rnd(12, 88) + "%";
      s.style.animationDelay = rnd(0, 4) + "s";
      stage.appendChild(s);
    }

    const sub = document.createElement("p");
    sub.className = "money-sub";
    sub.textContent = "ты получила за свою учебу, ты умничка!";
    stage.appendChild(sub);

    const skip = document.createElement("button");
    skip.className = "skip";
    skip.type = "button";
    skip.textContent = "дальше";
    stage.appendChild(skip);

    overlay.appendChild(stage);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.style.transition = "opacity 0.9s ease";
      overlay.style.opacity = "0";
      setTimeout(function () {
        overlay.classList.remove("on");
        overlay.innerHTML = "";
        overlay.style.opacity = "";
        overlay.style.transition = "";
        resolve();
      }, 900);
    }

    skip.onclick = close;
    setTimeout(close, REDUCED ? 3000 : 15000);
  });
}

window.Scenes = Scenes;
window.playMinigame = playMinigame;
window.playTransitionVideo = playTransitionVideo;
window.playMoney = playMoney;
window.MEDIA = MEDIA;
