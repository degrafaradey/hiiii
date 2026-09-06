/* ============================================================
   СЦЕНЫ КВИЗА — у каждого вопроса своя стилистика

   Файлы клади в media/ рядом с app.py. Любого может не быть —
   сцена нарисуется и без него.
   ============================================================ */

const MEDIA = {
  flower:       "/media/flower.png",   // цветок для первого экрана (png, прозрачный фон)
  epic:         "/media/epic.jpg",     // статуя для вопроса про Одиссею
  foreman:      "/media/foreman.png",  // Форман, вырезанный
  foremanVideo: "/media/foreman.mp4",  // видео после ответа про Хауса
  trio:         "/media/trio.png",     // Артём, Аня и Саша, вырезанные
  vika:         "/media/vika.jpg",     // ваша с ней фотка для пятого вопроса
  iam:          "/media/iam.mp4",      // видео-фон вопроса «I am?...»
  house:        "/media/house.png",    // голова Хауса для крестиков-ноликов
  wilson:       "/media/wilson.png",   // голова Уилсона
};

/* Сообщения троицы — правь тут */
const TRIO_LINES = [
  { who: "Артём", text: "ЛЯЯЯЯ, ВЫ ВИДЕЛИ СКОКА ВИКА УЖЕ ПОЗАНИМАЛИСЬ" },
  { who: "Аня",   text: "Да она ваще соска, ты сомневался?" },
  { who: "Саша",  text: "ТРИ ЧАСА БЛ#ТЬ, я и 20 минут еле за учебниками высиживаю, она правда молодец" },
];

const TRIO_ERROR = "все сообщения реальны";

/* Первый вопрос: фразы пролетают, из мелких слов собирается стена */
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

const WALL_TOKENS = ["ты", "умничка", "горжусь", "закл", "сможешь", "верю", "сила", "топ", "дожмёшь", "моя", "умница", "рядом"];
const WALL_MESSAGE = ["у тебя всё", "получится,", "и ты знаешь,", "о чём я"];

/* Реплики Формана, пока она печатает */
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

/* ---------- помощники ---------- */

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function loadImage(src) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

function videoExists(src) {
  return new Promise(function (resolve) {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = function () { resolve(true); };
    v.onerror = function () { resolve(false); };
    v.src = src;
  });
}

function whenFonts(fn) {
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fn).catch(fn);
  else fn();
}

function make(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

/* четырёхлучевая искра */
function starSVG(size, color) {
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z" fill="' + color + '"/>' +
    "</svg>";
}

/* ============================================================
   ПЕРВЫЙ ЭКРАН — синий ботанический скан
   ============================================================ */

function flowerSVG() {
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const rot = i * 72 + (i % 2 ? 3 : -3);
    petals.push(
      '<g transform="rotate(' + rot + ' 150 150)">' +
        '<path d="M150,150 C112,128 96,66 150,32 C204,66 188,128 150,150 Z" fill="url(#pg)"/>' +
        '<path d="M150,142 L150,44" stroke="rgba(255,255,255,.55)" stroke-width="1.1" fill="none"/>' +
        '<path d="M150,138 C136,110 130,84 138,54" stroke="rgba(255,255,255,.3)" stroke-width=".9" fill="none"/>' +
        '<path d="M150,138 C164,110 170,84 162,54" stroke="rgba(255,255,255,.3)" stroke-width=".9" fill="none"/>' +
      "</g>");
  }
  const fil = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = (150 + Math.cos(a) * 22).toFixed(1);
    const y = (150 + Math.sin(a) * 22).toFixed(1);
    fil.push('<line x1="150" y1="150" x2="' + x + '" y2="' + y + '" stroke="rgba(255,255,255,.75)" stroke-width="1"/>' +
             '<circle cx="' + x + '" cy="' + y + '" r="2.4" fill="#e8e46a"/>');
  }
  return '<svg viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg"><defs>' +
    '<radialGradient id="pg" cx="50%" cy="82%" r="78%">' +
      '<stop offset="0%" stop-color="#eef3ff"/><stop offset="38%" stop-color="#9fb6f6"/>' +
      '<stop offset="76%" stop-color="#3f56d8"/><stop offset="100%" stop-color="#1b24e8"/>' +
    "</radialGradient></defs>" +
    '<path d="M150,168 C148,214 144,258 138,318" stroke="#dfe6f5" stroke-width="4" fill="none"/>' +
    '<path d="M148,232 C120,222 104,246 92,268" stroke="#dfe6f5" stroke-width="3" fill="none"/>' +
    petals.join("") +
    '<circle cx="150" cy="150" r="17" fill="#f2f0c0"/>' + fil.join("") +
    '<circle cx="150" cy="150" r="7" fill="#cfd25a"/></svg>';
}

const INTRO_FRAMES = [
  { x: 8,  y: 12, w: 46, h: 20, hex: "#6699FF", d: "0.3s" },
  { x: 46, y: 6,  w: 34, h: 26, hex: "#9900FF", d: "1.1s" },
  { x: 16, y: 32, w: 54, h: 22, hex: "#CCCC33", d: "1.9s" },
  { x: 58, y: 28, w: 30, h: 17, hex: "#FFFFFF", d: "2.7s" },
];

function sceneIntro(root, notes) {
  make("div", "grain", root);
  make("div", "intro-vignette", root);

  const wrap = make("div", "flower-wrap", root);
  loadImage(MEDIA.flower).then(function (img) {
    if (img) {
      const el = make("img", null, wrap);
      el.src = MEDIA.flower;
      el.alt = "";
    } else {
      wrap.innerHTML = flowerSVG();
    }
  });

  INTRO_FRAMES.forEach(function (f) {
    const box = make("div", "frame", root);
    box.style.setProperty("--x", f.x + "%");
    box.style.setProperty("--y", f.y + "%");
    box.style.setProperty("--w", f.w + "%");
    box.style.setProperty("--h", f.h + "%");
    box.style.setProperty("--d", f.d);
    box.innerHTML = '<u></u><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>';
    make("b", null, box).textContent = f.hex;
  });

  make("div", "loupe", root);
  make("div", "scanline", root);

  const hexrow = make("div", "hexrow", root);
  ["#1B24E8", "#9900FF", "#6699FF", "#CCCC33", "#FFFFFF"].forEach(function (h) {
    make("span", null, hexrow).textContent = h;
  });

  const spots = [
    { left: "20px", top: "16%", d: "2.4s" },
    { right: "20px", top: "42%", d: "3.1s" },
    { left: "20px", top: "52%", d: "3.8s" },
  ];
  (notes || []).slice(0, 3).forEach(function (text, i) {
    const n = make("div", "note", root);
    n.textContent = text;
    Object.keys(spots[i]).forEach(function (k) { if (k !== "d") n.style[k] = spots[i][k]; });
    n.style.setProperty("--d", spots[i].d);
  });

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  make("div", "credit", root).textContent = "graphics by Артём\n" + dd + "." + mm + "." + now.getFullYear();

  return { destroy: function () {} };
}

/* ============================================================
   ВОПРОС 1 — синий артхаус: искры, шипы и стена из слов
   ============================================================ */

function sceneWall(root) {
  make("div", "grain", root);

  /* шипы из центра */
  const spikes = make("div", "spikes", root);
  const rays = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd(0, Math.PI * 2);
    const len = rnd(38, 72);
    const wdt = rnd(1.6, 5);
    const x1 = 50 + Math.cos(a) * 4, y1 = 50 + Math.sin(a) * 4;
    const x2 = 50 + Math.cos(a) * len, y2 = 50 + Math.sin(a) * len;
    const nx = -Math.sin(a) * wdt, ny = Math.cos(a) * wdt;
    rays.push('<path d="M' + (x1 + nx) + ' ' + (y1 + ny) + ' L' + x2 + ' ' + y2 + ' L' + (x1 - nx) + ' ' + (y1 - ny) + ' Z" ' +
      'fill="#1b24e8" opacity="' + rnd(0.3, 0.75).toFixed(2) + '">' +
      '<animate attributeName="opacity" values="0;' + rnd(0.35, 0.8).toFixed(2) + ';0" dur="' +
      rnd(5, 9).toFixed(1) + 's" begin="' + rnd(0, 5).toFixed(1) + 's" repeatCount="indefinite"/></path>');
  }
  spikes.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + rays.join("") + "</svg>";

  for (let i = 0; i < 7; i++) {
    const s = make("div", "spark-star", root);
    s.style.left = rnd(8, 92) + "%";
    s.style.top = rnd(10, 88) + "%";
    s.style.setProperty("--d", rnd(0, 5).toFixed(1) + "s");
    s.innerHTML = starSVG(rnd(14, 46) | 0, i % 3 === 0 ? "#6699ff" : "#1b24e8");
  }

  /* стена из мелких слов */
  const canvas = make("canvas", "scene-canvas", root);
  let raf = null;
  const fitted = fitCanvas(canvas);
  const ctx = fitted.ctx, w = fitted.w, h = fitted.h;

  const WW = 1100;
  const HH = Math.round(Math.min(2600, Math.max(900, WW * (h / w))));
  const wall = document.createElement("canvas");
  wall.width = WW; wall.height = HH;
  const wctx = wall.getContext("2d");

  let tiles = [], drawn = 0;
  const fit = (w / WW) * 0.98;
  const zoomFrom = fit * 3.2;

  function build() {
    // маска: сообщение очень жирным шрифтом — толстые штрихи хорошо
    // ловятся сеткой, поэтому надпись читается на отдалении
    const mask = document.createElement("canvas");
    mask.width = Math.round(WW / 2);
    mask.height = Math.round(HH / 2);
    const m = mask.getContext("2d");
    m.fillStyle = "#fff";
    m.textAlign = "center";
    m.textBaseline = "middle";

    const lineH = mask.height / (WALL_MESSAGE.length + 0.8);
    let fs = lineH * 0.86;
    m.font = '800 ' + fs + 'px Archivo, Arial, sans-serif';
    const widest = Math.max.apply(null, WALL_MESSAGE.map(function (l) { return m.measureText(l).width; }));
    const limit = mask.width * 0.92;
    if (widest > limit) {
      fs *= limit / widest;
      m.font = '800 ' + fs + 'px Archivo, Arial, sans-serif';
    }
    const top = (mask.height - WALL_MESSAGE.length * lineH) / 2 + lineH / 2;
    WALL_MESSAGE.forEach(function (l, i) { m.fillText(l, mask.width / 2, top + i * lineH); });

    const md = m.getImageData(0, 0, mask.width, mask.height).data;
    function inside(x, y) {
      const mx = Math.round((x / WW) * mask.width);
      const my = Math.round((y / HH) * mask.height);
      if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height) return false;
      return md[(my * mask.width + mx) * 4 + 3] > 120;
    }

    tiles = [];
    for (let y = 18; y < HH; y += 17) {
      for (let x = 8; x < WW; x += 24) {
        const on = inside(x, y);
        if (!on && Math.random() > 0.2) continue;
        tiles.push({ x: x, y: y, on: on, word: pick(WALL_TOKENS) });
      }
    }
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = tiles[i]; tiles[i] = tiles[j]; tiles[j] = t;
    }
  }

  function grow(count) {
    wctx.textBaseline = "middle";
    for (let i = 0; i < count && drawn < tiles.length; i++, drawn++) {
      const t = tiles[drawn];
      if (t.on) {
        wctx.font = '600 13px Archivo, Arial, sans-serif';
        wctx.fillStyle = Math.random() < 0.22 ? "#6699ff" : "#f4f5f8";
      } else {
        wctx.font = '400 12px Archivo, Arial, sans-serif';
        wctx.fillStyle = "rgba(120,140,220,0.13)";
      }
      wctx.fillText(t.word, t.x, t.y);
    }
  }

  const flyers = WALL_PHRASES.map(function (text, i) {
    return { text: text, x: rnd(-0.42, 0.42), y: rnd(-0.4, 0.4),
             start: 120 + i * 240 + rnd(-70, 70), life: rnd(2100, 2900) };
  });

  const T_WALL = 2400, T_ZOOM = 6000, T_END = 10800;
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
        const k = 0.16 / Math.max(1 - p, 0.02);
        const size = Math.min(150, 16 * k);
        const alpha = Math.min(1, p * 4) * Math.max(0, 1 - Math.pow(p, 3.2)) * 0.9;
        ctx.font = '700 ' + size + 'px Archivo, Arial, sans-serif';
        ctx.fillStyle = "rgba(244,245,248," + alpha + ")";
        ctx.fillText(f.text, w / 2 + f.x * w * k * 2.6, h / 2 + f.y * h * k * 2.6);
      }
    }

    if (t > T_WALL) {
      if (drawn < tiles.length) grow(110);
      let scale, alpha;
      if (t < T_ZOOM) {
        scale = zoomFrom;
        alpha = Math.min(1, (t - T_WALL) / 1300);
      } else {
        const p = Math.min(1, (t - T_ZOOM) / (T_END - T_ZOOM));
        scale = zoomFrom + (fit - zoomFrom) * easeInOut(p);
        alpha = 1;
      }
      const dw = WW * scale, dh = HH * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(wall, 0, 0, WW, HH, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }

    if (t < T_END + 2400) raf = requestAnimationFrame(frame);
    else {
      canvas.style.transition = "opacity 2.4s ease";
      canvas.style.opacity = "0.5";
      raf = null;
    }
  }

  whenFonts(function () {
    build();
    if (REDUCED) {
      grow(tiles.length);
      const dw = WW * fit, dh = HH * fit;
      ctx.drawImage(wall, 0, 0, WW, HH, (w - dw) / 2, (h - dh) / 2, dw, dh);
      canvas.style.opacity = "0.5";
    } else {
      raf = requestAnimationFrame(frame);
    }
  });

  return { destroy: function () { if (raf) cancelAnimationFrame(raf); } };
}

/* ============================================================
   ВОПРОС 2 — оранжевый постер, Форман реагирует на набор
   ============================================================ */

function sceneForeman(root) {
  const sun = make("div", "sun", root);
  sun.style.width = "128vw";
  sun.style.height = "128vw";
  sun.style.left = "-14vw";
  sun.style.bottom = "-30vw";
  sun.style.opacity = "0.9";

  const duo = make("div", "duotone", root);
  duo.style.right = "-6%";
  duo.style.bottom = "0";
  duo.style.width = "min(74vw, 320px)";

  loadImage(MEDIA.foreman).then(function (img) {
    if (img) {
      const el = make("img", null, duo);
      el.src = MEDIA.foreman;
      el.alt = "";
    } else {
      duo.remove();
    }
  });

  make("div", "vertword", root).textContent = "ХАУС";

  const note = make("div", "orange-note", root);
  note.style.right = "20px";
  note.style.top = "13%";
  note.textContent = "команда меняется каждый сезон, кроме одного человека";

  const line = make("div", "reactor", root);
  let last = "", timer = null;

  function say(text) {
    if (!text || text === last) return;
    last = text;
    line.classList.remove("on");
    setTimeout(function () {
      line.textContent = text;
      line.classList.add("on");
    }, 170);
  }

  function reactTo(raw) {
    const t = (raw || "").toLowerCase();
    if (!t.trim()) { line.classList.remove("on"); last = ""; return; }
    if (t.indexOf("форман") >= 0 || t.indexOf("foreman") >= 0) return say(pick(FOREMAN_LINES.me));
    if (t.indexOf("хаус") >= 0 || t.indexOf("house") >= 0) return say(pick(FOREMAN_LINES.house));
    if (/чейз|кэмерон|кемерон|тауб|тринадцат|кадди|мастерс|парк/.test(t)) return say(pick(FOREMAN_LINES.others));
    if (t.indexOf("?") >= 0) return say(pick(FOREMAN_LINES.ask));
    if (t.length <= 3) return say(pick(FOREMAN_LINES.start));
    if (t.length <= 12) return say(pick(FOREMAN_LINES.short));
    if (t.length <= 45) return say(pick(FOREMAN_LINES.medium));
    return say(pick(FOREMAN_LINES.long));
  }

  return {
    onType: function (text) {
      clearTimeout(timer);
      timer = setTimeout(function () { reactTo(text); }, 250);
    },
    destroy: function () { clearTimeout(timer); },
  };
}

/* ============================================================
   ВОПРОС 3 — песок собирает картинку, потом встаёт «ОДИССЕЙ»
   ============================================================ */

function sceneSand(root) {
  const canvas = make("canvas", "scene-canvas", root);
  let raf = null, timers = [];
  const fitted = fitCanvas(canvas);
  const ctx = fitted.ctx, w = fitted.w, h = fitted.h;

  const veil = make("div", null, root);
  veil.style.cssText = "position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,14,24,.35),rgba(12,14,24,.86));";

  const source = document.createElement("canvas");
  source.width = Math.round(w);
  source.height = Math.round(h);
  const sctx = source.getContext("2d");

  function fallback() {
    const g = sctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#131730");
    g.addColorStop(0.5, "#4a5bae");
    g.addColorStop(0.78, "#8e9ce8");
    g.addColorStop(1, "#c8cff0");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, w, h);
    const sun = sctx.createRadialGradient(w * 0.5, h * 0.34, 0, w * 0.5, h * 0.34, w * 0.44);
    sun.addColorStop(0, "rgba(232,238,255,.8)");
    sun.addColorStop(1, "rgba(232,238,255,0)");
    sctx.fillStyle = sun;
    sctx.fillRect(0, 0, w, h);
  }

  function title() {
    const box = make("div", "odyssey", root);
    const echoes = [
      { dx: "-26px", dy: "-16px", ds: 1.12, d: "0.1s" },
      { dx: "22px", dy: "14px", ds: 1.18, d: "0.5s" },
      { dx: "0px", dy: "-30px", ds: 1.26, d: "0.9s" },
    ];
    echoes.forEach(function (e) {
      const l = make("div", "layer outline", box);
      l.textContent = "Одиссей";
      l.style.setProperty("--dx", e.dx);
      l.style.setProperty("--dy", e.dy);
      l.style.setProperty("--ds", e.ds);
      l.style.setProperty("--d", e.d);
    });
    const solid = make("div", "layer fill", box);
    solid.textContent = "Одиссей";
    solid.style.setProperty("--d", "0.2s");
    make("div", "ody-sweep", box);

    const sub = make("div", "ody-sub", root);
    sub.textContent = "мотив, который он узнаёт последним";
  }

  function start(img) {
    if (img) {
      const r = Math.max(w / img.width, h / img.height);
      sctx.drawImage(img, (w - img.width * r) / 2, (h - img.height * r) / 2, img.width * r, img.height * r);
    } else {
      fallback();
    }

    if (REDUCED) {
      ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, w, h);
      title();
      return;
    }

    const data = sctx.getImageData(0, 0, source.width, source.height).data;
    const step = 8, cx = w / 2, cy = h / 2;
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
          delay: (1 - d / maxD) * 3400 + rnd(0, 450),
          dur: rnd(1000, 1700),
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
    timers.push(setTimeout(title, 5200));
  }

  loadImage(MEDIA.epic).then(start);

  return {
    destroy: function () {
      if (raf) cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    },
  };
}

/* ============================================================
   ВОПРОС 4 — Frutiger Aero: небо, холм и окна сообщений
   ============================================================ */

function xpIcon(kind) {
  if (kind === "error") {
    return '<svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="16" cy="16" r="14" fill="#d0311a" stroke="#8f1c0c"/>' +
      '<path d="M10 10 L22 22 M22 10 L10 22" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>';
  }
  return '<svg viewBox="0 0 32 32" width="28" height="28" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="3" y="7" width="26" height="17" rx="2" fill="#e8f2ff" stroke="#4a7ab8"/>' +
    '<path d="M3 9 L16 18 L29 9" fill="none" stroke="#4a7ab8" stroke-width="2"/></svg>';
}

function deskIcon(kind) {
  if (kind === "globe") {
    return '<svg viewBox="0 0 48 48" width="46" height="46" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="24" cy="24" r="18" fill="#2f7fd4" stroke="#1a4f8f"/>' +
      '<path d="M6 24h36M24 6c8 9 8 27 0 36M24 6c-8 9-8 27 0 36" fill="none" stroke="#bfe4ff"/>' +
      '<path d="M14 14c6 3 14 3 20 0M14 34c6-3 14-3 20 0" fill="none" stroke="#6bbf4a" stroke-width="3"/></svg>';
  }
  if (kind === "trash") {
    return '<svg viewBox="0 0 48 48" width="46" height="46" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M13 14h22l-3 26H16z" fill="#c9d2da" stroke="#6c7d8c"/>' +
      '<path d="M20 18v18M24 18v18M28 18v18" stroke="#8b9aa8"/>' +
      '<rect x="11" y="9" width="26" height="5" rx="2" fill="#aab6c2" stroke="#6c7d8c"/></svg>';
  }
  return '<svg viewBox="0 0 48 48" width="46" height="46" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M6 12h14l4 5h18v23H6z" fill="#f6d97a" stroke="#b8912e"/>' +
    '<path d="M6 20h36v20H6z" fill="#fce9a8" stroke="#b8912e"/></svg>';
}

function cursorSVG() {
  return '<svg viewBox="0 0 24 32" width="20" height="27" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2 1 L2 24 L8 18.5 L12 28 L16 26 L12 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="1.6"/></svg>';
}

function xpWindow(root, title, text, kind) {
  const win = make("div", "win" + (kind === "error" ? " error" : ""), root);
  const bar = make("div", "bar", win);
  make("span", null, bar).textContent = title;
  make("em", null, bar).textContent = "✕";
  const body = make("div", "body", win);
  const ico = make("div", "ico", body);
  ico.innerHTML = xpIcon(kind);
  make("div", null, body).textContent = text;
  const foot = make("div", "foot", win);
  make("button", "ok", foot).textContent = "OK";
  return win;
}

function sceneAero(root) {
  make("div", "aero-sky", root);
  make("div", "aero-clouds", root);

  const icons = make("div", "desk-icons", root);
  [["globe", "Internet.exe"], ["trash", "Корзина"], ["folder", "Вика"]].forEach(function (it) {
    const fig = make("figure", null, icons);
    fig.innerHTML = deskIcon(it[0]);
    make("figcaption", null, fig).textContent = it[1];
  });

  const cut = make("div", "cutout", root);
  loadImage(MEDIA.trio).then(function (img) {
    if (img) {
      const el = make("img", null, cut);
      el.src = MEDIA.trio;
      el.alt = "";
      const box = make("div", "select-box", root);
      box.style.cssText = "left:14%;right:14%;bottom:2%;top:34%;";
    } else {
      cut.remove();
    }
  });

  const cur = make("div", "cursor", root);
  cur.innerHTML = cursorSVG();

  const spots = [
    { left: "4%", top: "8%" },
    { right: "3%", top: "27%" },
    { left: "7%", top: "44%" },
  ];

  const wins = TRIO_LINES.map(function (l, i) {
    const w = xpWindow(root, l.who, l.text, "msg");
    Object.keys(spots[i]).forEach(function (k) { w.style[k] = spots[i][k]; });
    return w;
  });

  const err = xpWindow(root, "Ошибка", TRIO_ERROR, "error");
  err.style.left = "50%";
  err.style.top = "58%";
  err.style.marginLeft = "min(-38vw, -146px)";

  const timers = [];
  function run() {
    wins.forEach(function (w, i) {
      timers.push(setTimeout(function () { w.classList.add("on"); }, 500 + i * 1500));
    });
    timers.push(setTimeout(function () {
      err.classList.add("on", "shake");
    }, 500 + wins.length * 1500 + 700));
    timers.push(setTimeout(function () {
      err.classList.remove("on", "shake");
      wins.forEach(function (w) { w.classList.remove("on"); });
      timers.push(setTimeout(run, 1400));
    }, 500 + wins.length * 1500 + 5200));
  }

  if (REDUCED) {
    wins.forEach(function (w) { w.classList.add("on"); });
    err.classList.add("on");
  } else {
    run();
  }

  return { destroy: function () { timers.forEach(clearTimeout); } };
}

/* ============================================================
   ВОПРОС 5 — кислотный коллаж с вашей фоткой
   ============================================================ */

function scrap(root, cls, html, x, y, rot, delay, taped) {
  const s = make("div", "scrap" + (taped ? " tape" : ""), root);
  s.style.setProperty("--r", rot + "deg");
  s.style.setProperty("--d", delay + "s");
  Object.keys(x).forEach(function (k) { s.style[k] = x[k]; });
  s.style.top = y;
  const inner = make("div", cls, s);
  inner.innerHTML = html;
  return s;
}

function receiptHTML() {
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push('<i style="width:' + (30 + Math.random() * 60) + '%"></i>');
  return rows.join("");
}

function barcodeHTML() {
  const bars = [];
  for (let i = 0; i < 26; i++) bars.push('<i style="height:' + (40 + Math.random() * 60) + '%"></i>');
  return bars.join("");
}

function puffy(root, word, top) {
  const box = make("div", "puffy", root);
  box.style.top = top;
  word.split("").forEach(function (ch, i) {
    const s = make("span", null, box);
    s.textContent = ch === " " ? "\u00a0" : ch;
    s.style.setProperty("--d", (0.25 + i * 0.09).toFixed(2) + "s");
  });
  return box;
}

function sceneY2K(root) {
  make("div", "y2k-sky", root);

  [[-14, 18, 62, 34, -8], [46, 58, 70, 30, 6]].forEach(function (b, i) {
    const blob = make("div", "y2k-blob", root);
    blob.style.left = b[0] + "%";
    blob.style.top = b[1] + "%";
    blob.style.width = b[2] + "%";
    blob.style.height = b[3] + "%";
    blob.style.setProperty("--r", b[4] + "deg");
    blob.style.opacity = i ? "0.75" : "0.9";
    blob.style.borderRadius = i ? "48% 52% 40% 60%" : "56% 44% 62% 38%";
  });

  const photo = make("div", "y2k-photo", root);
  loadImage(MEDIA.vika).then(function (img) {
    if (img) {
      const el = make("img", null, photo);
      el.src = MEDIA.vika;
      el.alt = "";
    } else {
      photo.style.background = "#ffe94a";
      photo.style.height = "40vh";
    }
  });

  puffy(root, "ВИКА", "6%");
  make("div", "halftone", root);

  scrap(root, "scrap-label", "Nothing makes sense,<br>and that's okay.", { left: "4%" }, "60%", -7, 1.3, true);
  scrap(root, "scrap-receipt", receiptHTML(), { right: "6%" }, "56%", 6, 1.6, true);
  scrap(root, "scrap-barcode", barcodeHTML(), { right: "5%" }, "84%", -4, 2.0, false);
  scrap(root, "scrap-stripes", "", { left: "8%" }, "80%", 9, 2.3, false);

  return { destroy: function () {} };
}

/* ============================================================
   ВОПРОС 6 — окно старой винды, внутри видео
   ============================================================ */

function sceneAeroVideo(root, src) {
  make("div", "aero-sky", root);
  make("div", "aero-clouds", root);

  const win = make("div", "video-win", root);
  const bar = make("div", "bar", win);
  make("span", null, bar).textContent = "wilson.avi";
  make("em", null, bar).textContent = "✕";
  make("div", "menu", win).textContent = "Файл   Правка   Вид   Справка";
  const area = make("div", "screen-area", win);

  const v = make("video", null, area);
  v.src = src;
  v.muted = true;
  v.loop = true;
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("muted", "");
  v.onerror = function () { area.style.background = "#0b1020"; v.remove(); };
  const p = v.play();
  if (p && p.catch) p.catch(function () {});

  const cur = make("div", "cursor", root);
  cur.innerHTML = cursorSVG();

  return { destroy: function () { v.pause(); } };
}

/* ============================================================
   Менеджер сцен
   ============================================================ */

const BUILDERS = {
  0: sceneWall,
  1: sceneForeman,
  2: sceneSand,
  3: sceneAero,
  4: sceneY2K,
  5: function (root) { return sceneAeroVideo(root, MEDIA.iam); },
};

const Scenes = {
  current: null,
  currentIndex: null,

  enter: function (index, extra) {
    if (this.currentIndex === index) return;
    this.leave();

    const root = document.createElement("div");
    root.className = "scene";

    let built;
    if (index === "intro") {
      built = sceneIntro(root, extra);
    } else {
      const build = BUILDERS[index];
      if (!build) return;
      built = build(root);
    }

    document.getElementById("scene").appendChild(root);
    this.current = built || {};
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
   Крестики-нолики — оранжевый постер
   ============================================================ */

const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

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
  if (Math.random() < 0.28) return pick(free);
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
    overlay.className = "on";

    const skin = make("div", "ov-orange", overlay);
    skin.style.cssText = "position:absolute;inset:0;overflow:hidden;";
    make("div", "ov-sun", skin);

    const faces = {};

    function done() {
      overlay.className = "";
      overlay.innerHTML = "";
      resolve();
    }

    function avatar(mark) {
      const box = document.createElement("div");
      box.className = "avatar";
      box.appendChild(markNode(mark, faces));
      return box;
    }

    function choice() {
      const ov = make("div", "ov", skin);
      make("h3", null, ov).textContent = "За кого играешь?";
      make("p", null, ov).textContent = "Три в ряд перед следующим вопросом. Ходишь первой.";

      const sides = make("div", "sides", ov);
      [["h", "Хаус", "крестик"], ["w", "Уилсон", "нолик"]].forEach(function (it) {
        const btn = make("button", "side", sides);
        btn.type = "button";
        btn.appendChild(avatar(it[0]));
        make("span", null, btn).textContent = it[1];
        make("span", "mark", btn).textContent = it[2];
        btn.onclick = function () {
          btn.classList.add("picked");
          setTimeout(function () { board(it[0]); }, 250);
        };
      });

      const skip = make("button", "ghost", ov);
      skip.type = "button";
      skip.textContent = "пропустить игру";
      skip.onclick = done;
    }

    function board(me) {
      const ai = me === "h" ? "w" : "h";
      const b = new Array(9).fill(null);
      let locked = false;

      skin.innerHTML = "";
      make("div", "ov-sun", skin);
      const ov = make("div", "ov", skin);

      make("h3", null, ov).textContent = me === "h" ? "Ты — Хаус" : "Ты — Уилсон";
      make("p", null, ov).textContent = "Собери три в ряд.";

      const grid = make("div", "board", ov);
      const cells = [];
      for (let i = 0; i < 9; i++) {
        const c = make("button", "cell", grid);
        c.type = "button";
        (function (idx) { c.onclick = function () { human(idx); }; })(i);
        cells.push(c);
      }

      const line = make("p", "verdict-line", ov);
      const next = make("button", "action", ov);
      next.type = "button";
      next.textContent = "К вопросу";
      next.hidden = true;
      next.onclick = done;

      function put(i, mark) {
        b[i] = mark;
        cells[i].appendChild(markNode(mark, faces));
        cells[i].disabled = true;
      }

      function finish(res) {
        locked = true;
        cells.forEach(function (c) { c.disabled = true; });
        if (res.line) res.line.forEach(function (i) { cells[i].classList.add("win"); });
        if (res.mark === "draw") line.textContent = "Ничья. Как у них двоих обычно";
        else if (res.mark === me) line.textContent = "Ты выиграла. Разумеется";
        else line.textContent = "Не твоё поле. Ничего";
        next.hidden = false;
      }

      function human(i) {
        if (locked || b[i]) return;
        put(i, me);
        let res = winnerOf(b);
        if (res) return finish(res);
        locked = true;
        setTimeout(function () {
          const j = aiMove(b, ai);
          if (j >= 0) put(j, ai);
          const r = winnerOf(b);
          if (r) finish(r);
          else locked = false;
        }, 400);
      }
    }

    Promise.all([loadImage(MEDIA.house), loadImage(MEDIA.wilson)]).then(function (r) {
      if (r[0]) faces.h = MEDIA.house;
      if (r[1]) faces.w = MEDIA.wilson;
      choice();
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
      overlay.className = "on";

      const wrap = make("div", "ov-video-wrap", overlay);
      const v = make("video", "ov-video", wrap);
      v.src = src;
      v.autoplay = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");

      const skip = make("button", "skip", overlay);
      skip.type = "button";
      skip.textContent = "дальше";

      let closed = false;
      function close() {
        if (closed) return;
        closed = true;
        v.pause();
        overlay.className = "";     // резкий обрыв, без затухания
        overlay.innerHTML = "";
        resolve();
      }

      v.onended = close;
      v.onerror = close;
      skip.onclick = close;
      setTimeout(close, 20000);
      const p = v.play();
      if (p && p.catch) p.catch(close);
    });
  });
}

/* ============================================================
   Финал — кислотный коллаж, «1111 ₽» влетает рывками
   ============================================================ */

function playMoney() {
  return new Promise(function (resolve) {
    const overlay = document.getElementById("overlay");
    overlay.innerHTML = "";
    overlay.className = "on";

    const stage = make("div", "ov-money", overlay);
    make("div", "y2k-sky", stage);

    [[-18, 22, 74, 30, -10], [40, 54, 78, 28, 8]].forEach(function (b) {
      const blob = make("div", "y2k-blob", stage);
      blob.style.left = b[0] + "%";
      blob.style.top = b[1] + "%";
      blob.style.width = b[2] + "%";
      blob.style.height = b[3] + "%";
      blob.style.setProperty("--r", b[4] + "deg");
      blob.style.borderRadius = "52% 48% 44% 56%";
    });

    for (let i = 0; i < 6; i++) {
      const s = make("div", "spark-star", stage);
      s.style.left = rnd(8, 92) + "%";
      s.style.top = rnd(12, 84) + "%";
      s.style.setProperty("--d", rnd(0.4, 3).toFixed(1) + "s");
      s.innerHTML = starSVG(rnd(20, 60) | 0, i % 2 ? "#ffe94a" : "#ff2d8f");
    }

    puffy(stage, "1111 ₽", "26%");
    make("div", "halftone", stage);

    scrap(stage, "scrap-label", "always<br>BE happy", { left: "5%" }, "12%", -9, 2.2, true);
    scrap(stage, "scrap-barcode", barcodeHTML(), { right: "6%" }, "13%", 5, 2.5, false);
    scrap(stage, "scrap-stripes", "", { right: "7%" }, "70%", -8, 2.8, false);
    scrap(stage, "scrap-receipt", receiptHTML(), { left: "6%" }, "66%", 7, 3.1, true);

    const sub = make("p", "money-sub", stage);
    sub.textContent = "ты получила за свою учебу, ты умничка!";

    const skip = make("button", "skip", stage);
    skip.type = "button";
    skip.textContent = "дальше";

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.style.transition = "opacity .6s ease";
      overlay.style.opacity = "0";
      setTimeout(function () {
        overlay.className = "";
        overlay.innerHTML = "";
        overlay.style.opacity = "";
        overlay.style.transition = "";
        resolve();
      }, 600);
    }

    skip.onclick = close;
    setTimeout(close, REDUCED ? 3000 : 12000);
  });
}

window.Scenes = Scenes;
window.playMinigame = playMinigame;
window.playTransitionVideo = playTransitionVideo;
window.playMoney = playMoney;
window.MEDIA = MEDIA;
