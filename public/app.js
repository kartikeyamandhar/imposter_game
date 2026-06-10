/* Suss — client logic: online (Partykit), offline pass & play, animations.
 *
 * PRIVACY: the only thing this stores is a sound on/off flag (localStorage).
 * The per-tab reconnection id lives in sessionStorage and dies with the tab.
 * No names, scores, or game data are ever persisted on the device. */

"use strict";

/* ============================================================ CONFIG ===== */
// After `npx partykit deploy`, set this to your deployed Partykit host
// (shown in the deploy output, e.g. "suss.yourname.partykit.dev").
const PROD_PARTYKIT_HOST = "suss.USERNAME.partykit.dev";

function partykitHost() {
  const h = location.hostname;
  // In dev the static site and the Partykit server share one origin, so connect
  // back to whatever host:port the page was served from (works on any port).
  if (h === "localhost" || h === "127.0.0.1" || h === "")
    return location.host || "127.0.0.1:1999";
  return PROD_PARTYKIT_HOST;
}
function wsProtocol() {
  return location.protocol === "https:" ? "wss" : "ws";
}

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no O,I,L,0,1
const REDUCED_MOTION = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

/* ============================================================ HELPERS ==== */
const $ = (id) => document.getElementById(id);
function setText(el, s) {
  if (el) el.textContent = s == null ? "" : String(s);
}
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.toggle("active", s.dataset.screen === name);
  });
  window.scrollTo(0, 0);
}
function makeEl(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  setText(t, msg);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}
function validCode(c) {
  return (
    typeof c === "string" &&
    /^[A-Z2-9]{4}$/.test(c) &&
    [...c].every((ch) => CODE_CHARS.includes(ch))
  );
}
function genCode() {
  let c = "";
  for (let i = 0; i < 4; i++)
    c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

/* ============================================================ SOUND ====== */
const Sound = {
  on: false,
  ctx: null,
  init() {
    this.on = localStorage.getItem("suss_sound") === "1";
    updateSoundLabel();
  },
  toggle() {
    this.on = !this.on;
    try {
      localStorage.setItem("suss_sound", this.on ? "1" : "0");
    } catch {}
    if (this.on) this.ensure();
    updateSoundLabel();
  },
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {}
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  blip(freq, dur, type, gain) {
    if (!this.on) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(this.ctx.destination);
    g.gain.setValueAtTime(gain || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  },
  reveal() {
    this.blip(330, 0.18, "triangle", 0.05);
    setTimeout(() => this.blip(494, 0.24, "triangle", 0.05), 120);
  },
  vote() {
    this.blip(150, 0.12, "square", 0.06);
  },
  result() {
    this.blip(262, 0.35, "sine", 0.05);
    setTimeout(() => this.blip(330, 0.35, "sine", 0.05), 60);
    setTimeout(() => this.blip(392, 0.45, "sine", 0.05), 120);
  },
  tick() {
    this.blip(880, 0.05, "square", 0.03);
  },
};
function updateSoundLabel() {
  setText($("btn-sound"), "Sound: " + (Sound.on ? "On" : "Off"));
}

/* ============================================================ TYPEWRITER = */
// Reveal a word. The full word is placed in the DOM immediately (so it can
// never be caught blank / mid-animation), then a quick fade+glow flourish plays.
// Earlier this typed character-by-character at ~100ms/char, which left long
// words looking blank for over a second — a pass-and-play reveal must be instant.
function typeWord(el, word, opts) {
  opts = opts || {};
  const w = word == null ? "" : String(word);
  el.classList.remove("pulse", "caret", "revealin");
  setText(el, w);
  if (!REDUCED_MOTION) {
    void el.offsetWidth; // restart the animation on each reveal
    el.classList.add("revealin");
  } else {
    el.classList.add("pulse");
  }
  if (opts.onDone) opts.onDone();
}

/* ============================================================ WORD PICK === */
// Mirrors src/words.ts pickWords for offline play.
function pickWordsLocal(categoryName, decoy, used) {
  const cats = window.SUSS_WORDS;
  const cat =
    categoryName === "Random" || !cats.find((c) => c.name === categoryName)
      ? cats[Math.floor(Math.random() * cats.length)]
      : cats.find((c) => c.name === categoryName);
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  if (decoy) {
    const usable = cat.clusters.filter((c) => c.length >= 2);
    const fresh = usable.filter(
      (c) => c.filter((w) => !used.has(w)).length >= 2
    );
    const cluster = rand(fresh.length ? fresh : usable);
    const unused = cluster.filter((w) => !used.has(w));
    const source = unused.length >= 2 ? unused : cluster.slice();
    const i = Math.floor(Math.random() * source.length);
    const civilianWord = source[i];
    const decoyWord = rand(source.filter((_, idx) => idx !== i));
    return { category: cat.name, civilianWord, decoyWord };
  }
  const all = cat.clusters.flat();
  const fresh = all.filter((w) => !used.has(w));
  return {
    category: cat.name,
    civilianWord: rand(fresh.length ? fresh : all),
    decoyWord: null,
  };
}

/* ============================================================ STATE ====== */
const state = {
  mode: null, // 'online' | 'offline'
  code: null,
  intent: null, // 'create' | 'join'
  name: "",
  myId: null,
  host: null,
  players: [],
  settings: null,
  phase: "LOBBY",
  gameActive: false,
  role: null,
  word: null,
  roundMode: "classic",
  categoryHint: null,
  turnOrder: [],
  currentTurn: null,
  voted: null,
  timerContext: null,
  lastStandActive: false,
  leaving: false,
};
const isHost = () => state.myId && state.host === state.myId;

/* ============================================================ SOCKET ===== */
let socket = null;
let reconnectTimer = null;
let reconnectDelay = 600;

function connId() {
  let id = sessionStorage.getItem("suss_cid");
  if (!id) {
    id =
      (crypto.randomUUID && crypto.randomUUID()) ||
      Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessionStorage.setItem("suss_cid", id);
  }
  return id;
}

function connect() {
  const url =
    `${wsProtocol()}://${partykitHost()}/parties/main/${state.code}` +
    `?_pk=${encodeURIComponent(connId())}`;
  socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    reconnectDelay = 600;
    $("conn-banner").hidden = true;
    send({ type: "join", name: state.name });
  });
  socket.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleMessage(msg);
  });
  socket.addEventListener("close", () => {
    if (state.leaving) return;
    $("conn-banner").hidden = false;
    scheduleReconnect();
  });
  socket.addEventListener("error", () => {
    try {
      socket.close();
    } catch {}
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 1.6, 5000);
    connect();
  }, reconnectDelay);
}

function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

function leaveGame() {
  state.leaving = true;
  clearTimeout(reconnectTimer);
  try {
    socket && socket.close();
  } catch {}
  socket = null;
  resetState();
  show("home");
}
function resetState() {
  Object.assign(state, {
    mode: null,
    code: null,
    intent: null,
    myId: null,
    host: null,
    players: [],
    settings: null,
    phase: "LOBBY",
    gameActive: false,
    role: null,
    word: null,
    turnOrder: [],
    currentTurn: null,
    voted: null,
    timerContext: null,
    lastStandActive: false,
    leaving: false,
  });
}

/* ============================================================ DISPATCH === */
function handleMessage(msg) {
  switch (msg.type) {
    case "your_id":
      state.myId = msg.id;
      break;
    case "lobby_update":
      onLobby(msg);
      break;
    case "ready_update":
      state.players = msg.players;
      renderReadyList();
      break;
    case "game_start":
      onGameStart(msg);
      break;
    case "your_role":
      state.role = msg.role;
      state.word = msg.word;
      state.roundMode = msg.mode;
      state.categoryHint = msg.categoryHint || null;
      break;
    case "phase_change":
      onPhaseChange(msg);
      break;
    case "timer":
      onTimer(msg.seconds);
      break;
    case "vote_update":
      setText(
        $("vote-status"),
        `${msg.votedCount} / ${msg.totalPlayers} voted`
      );
      break;
    case "result":
      onResult(msg);
      break;
    case "last_stand":
      onLastStand(msg);
      break;
    case "imposter_guess_result":
      state.lastStandActive = false;
      $("laststand-overlay").hidden = true;
      toast(msg.correct ? "Correct — you survive!" : "Wrong. Civilians win.");
      break;
    case "player_left":
      if (!msg.kicked) toast(`${msg.name} left`);
      break;
    case "kicked":
      toast("You were removed from the room");
      leaveGame();
      break;
    case "error":
      onError(msg);
      break;
    case "state_catchup":
      onCatchup(msg);
      break;
  }
}

function onError(msg) {
  if (msg.code === "in_progress" || msg.code === "room_full") {
    toast(msg.message);
    leaveGame();
  } else {
    setText($("lobby-msg"), msg.message || "Error");
    toast(msg.message || "Error");
  }
}

/* ============================================================ LOBBY ====== */
function onLobby(msg) {
  state.players = msg.players;
  state.host = msg.host;
  state.settings = msg.settings;
  state.gameActive = msg.gameActive;
  if (msg.phase) state.phase = msg.phase;
  if (state.phase === "LOBBY") {
    show("lobby");
    renderLobby();
  }
}

function renderLobby() {
  setText($("lobby-code"), state.code);
  setText($("player-count"), state.players.length);

  const list = $("player-list");
  list.replaceChildren();
  for (const p of state.players) {
    const li = makeEl("li");
    const left = makeEl("span", "pname");
    left.appendChild(makeEl("span", null, p.name));
    if (p.isHost) left.appendChild(makeEl("span", "badge", "Host"));
    if (p.id === state.myId) left.appendChild(makeEl("span", "badge you", "You"));
    if (!p.connected) left.appendChild(makeEl("span", "muted", "(away)"));
    li.appendChild(left);
    if (isHost() && p.id !== state.myId) {
      const k = makeEl("button", "kick-btn", "✕");
      k.title = "Kick";
      k.addEventListener("click", () => send({ type: "kick", target: p.id }));
      li.appendChild(k);
    }
    list.appendChild(li);
  }

  renderSettings();

  const startBtn = $("btn-start");
  const enough = state.players.filter((p) => p.connected).length >= msg_min();
  startBtn.style.display = isHost() ? "block" : "none";
  startBtn.disabled = !enough;
  setText(
    $("lobby-msg"),
    isHost()
      ? enough
        ? ""
        : `Need ${msg_min()}+ players to start`
      : "Waiting for the host to start…"
  );
}
function msg_min() {
  return 4;
}

function renderSettings() {
  const panel = $("settings-panel");
  const s = state.settings;
  if (!s) return;
  panel.classList.toggle("settings-readonly", !isHost());

  // segmented controls
  setSeg("mode", s.mode);
  setSeg("imposterCount", String(s.imposterCount));
  setSeg("discussionTimer", String(s.discussionTimer));
  setSeg("rounds", String(s.rounds));
  setSeg("imposterHint", s.imposterHint ? "on" : "off");

  // category select
  const sel = $("category-select");
  if (sel.value !== s.category) sel.value = s.category;

  // imposter hint only in classic mode
  $("hint-setting").style.display = s.mode === "classic" ? "flex" : "none";

  // clamp imposter options to floor(players/3)
  const maxImp = Math.max(1, Math.floor(state.players.length / 3));
  document
    .querySelectorAll('#imposter-seg .seg-btn')
    .forEach((b) => (b.disabled = Number(b.dataset.val) > Math.min(3, maxImp)));
}
function setSeg(setting, val) {
  document
    .querySelectorAll(`.setting[data-setting="${setting}"] .seg-btn`)
    .forEach((b) => b.classList.toggle("active", b.dataset.val === val));
}

function pushSettings(partial) {
  if (!isHost()) return;
  state.settings = Object.assign({}, state.settings, partial);
  send({ type: "update_settings", settings: state.settings });
  renderSettings();
}

/* ============================================================ REVEAL ===== */
function onGameStart(msg) {
  state.phase = "REVEAL";
  state.turnOrder = msg.turnOrder;
  state.roundMode = msg.mode;
  state.voted = null;
  setText($("reveal-round"), msg.round);
  $("reveal-overlay").hidden = true;
  $("btn-ready").hidden = true;
  const tap = $("btn-reveal-card");
  tap.disabled = false;
  setText(tap, "Tap to see your secret");
  renderReadyList();
  show("reveal");
}

function renderReadyList() {
  const ul = $("reveal-ready-list");
  if (!ul) return;
  ul.replaceChildren();
  for (const p of state.players) {
    const li = makeEl("li");
    const left = makeEl("span", "pname", p.name);
    li.appendChild(left);
    li.appendChild(makeEl("span", p.ready ? "tick" : "muted", p.ready ? "✓" : "…"));
    ul.appendChild(li);
  }
}

function openReveal() {
  const overlay = $("reveal-overlay");
  const wordEl = $("reveal-word");
  const label = $("reveal-label");
  const sub = $("reveal-sub");
  wordEl.classList.remove("imposter");
  setText(sub, "");

  let display, isImposterCard = false;
  if (state.roundMode === "classic" && state.role === "imposter") {
    display = "IMPOSTER";
    isImposterCard = true;
    setText(label, "You are the");
    if (state.categoryHint) setText(sub, "Category: " + state.categoryHint);
  } else {
    display = state.word || "";
    setText(label, "Your word");
  }
  if (isImposterCard) wordEl.classList.add("imposter");

  overlay.hidden = false;
  $("btn-ready").hidden = true;
  $("btn-reveal-card").disabled = true;
  Sound.reveal();

  typeWord(wordEl, display);
  // brief dwell so players can read/memorize before the Ready button appears
  const wait = REDUCED_MOTION ? 500 : 2200;
  setTimeout(() => {
    $("btn-ready").hidden = false;
  }, wait);
}

function confirmReady() {
  send({ type: "revealed" });
  $("reveal-overlay").hidden = true;
  setText($("btn-reveal-card"), "Waiting for others…");
}

/* ============================================================ PHASES ===== */
function onPhaseChange(msg) {
  state.phase = msg.phase;
  if (msg.phase === "CLUES") {
    state.turnOrder = msg.turnOrder || state.turnOrder;
    state.currentTurn = msg.currentTurn;
    renderClues();
    show("clues");
  } else if (msg.phase === "DISCUSSION") {
    state.timerContext = "discussion";
    enterDiscussion(msg.seconds);
  } else if (msg.phase === "VOTING") {
    state.timerContext = "voting";
    state.voted = null;
    state.players = msg.players || state.players;
    renderVoting();
    show("voting");
    setText($("vote-status"), "");
  } else if (msg.phase === "RESULT") {
    if (msg.sub === "last_stand_wait") {
      show("result");
      prepResultWaiting(msg.caught);
      state.timerContext = "laststand";
    }
  } else if (msg.phase === "LOBBY") {
    state.phase = "LOBBY";
    state.gameActive = false;
    show("lobby");
    renderLobby();
  }
}

function renderClues() {
  const hint = $("clue-hint");
  if (state.roundMode === "classic" && state.role === "imposter" && state.categoryHint)
    setText(hint, "Hint — category: " + state.categoryHint);
  else setText(hint, "");

  const ul = $("clue-list");
  ul.replaceChildren();
  let reached = false;
  for (const p of state.turnOrder) {
    const li = makeEl("li");
    li.appendChild(makeEl("span", null, p.name));
    let tag = "";
    let cls = "";
    if (p.id === state.currentTurn) {
      cls = "current";
      tag = "Now";
      reached = true;
    } else if (!reached) {
      cls = "done";
      tag = "Done";
    } else {
      tag = "Up next";
    }
    li.className = cls;
    li.appendChild(makeEl("span", "tag", tag));
    ul.appendChild(li);
  }

  const myTurn = state.currentTurn === state.myId;
  const btn = $("btn-clue-done");
  btn.hidden = !myTurn;
  setText(
    $("clue-wait"),
    myTurn ? "Your turn — say your clue aloud." : "Clues are given aloud, in turn."
  );
}

function enterDiscussion(seconds) {
  show("discussion");
  const el = $("disc-timer");
  el.classList.remove("warn");
  setText(el, seconds > 0 ? seconds : "∞");
  const end = $("btn-end-discussion");
  end.hidden = !isHost();
}

function renderVoting() {
  const ul = $("vote-list");
  ul.replaceChildren();
  for (const p of state.players) {
    if (p.id === state.myId) continue;
    const btn = makeEl("button");
    btn.appendChild(makeEl("span", null, p.name + (p.connected ? "" : " (away)")));
    btn.dataset.id = p.id;
    if (state.voted === p.id) btn.classList.add("selected");
    btn.addEventListener("click", () => castVote(p.id));
    const li = makeEl("li");
    li.appendChild(btn);
    ul.appendChild(li);
  }
  setText($("vote-timer"), "30");
}
function castVote(targetId) {
  state.voted = targetId;
  send({ type: "vote", target: targetId });
  Sound.vote();
  document.querySelectorAll("#vote-list button").forEach((b) => {
    b.classList.toggle("selected", b.dataset.id === targetId);
  });
}

function onTimer(seconds) {
  if (state.timerContext === "discussion") {
    const el = $("disc-timer");
    setText(el, seconds > 0 ? seconds : "∞");
    el.classList.toggle("warn", seconds > 0 && seconds <= 10);
    if (seconds > 0 && seconds <= 5) Sound.tick();
  } else if (state.timerContext === "voting") {
    const el = $("vote-timer");
    setText(el, seconds);
    el.classList.toggle("warn", seconds <= 10);
  } else if (state.timerContext === "laststand") {
    setText($("laststand-timer"), seconds);
  }
}

/* ============================================================ LAST STAND = */
function onLastStand(msg) {
  state.lastStandActive = true;
  state.timerContext = "laststand";
  show("result");
  prepResultWaiting(state.name);
  $("laststand-overlay").hidden = false;
  setText($("laststand-timer"), msg.seconds);
  const input = $("laststand-input");
  input.value = "";
  setTimeout(() => input.focus(), 50);
}
function submitLastStand() {
  const w = $("laststand-input").value;
  send({ type: "imposter_guess", word: w });
  $("laststand-overlay").hidden = true;
}

/* ============================================================ RESULT ===== */
function prepResultWaiting(caughtName) {
  setText($("result-verdict"), "Last stand");
  setText($("result-word"), "· · ·");
  setText($("result-decoy"), "");
  setText($("result-imposters"), "");
  setText($("result-detail"), `${caughtName} is guessing the word…`);
  $("result-votes").replaceChildren();
  $("scoreboard").replaceChildren();
  $("btn-next-round").hidden = true;
  setText($("result-wait"), "");
}

function onResult(msg) {
  state.phase = "RESULT";
  state.lastStandActive = false;
  state.timerContext = null;
  $("laststand-overlay").hidden = true;
  show("result");
  Sound.result();

  const verdict = $("result-verdict");
  if (msg.impostersWin) {
    setText(verdict, "Imposters win");
    verdict.className = "eyebrow verdict-lose";
  } else {
    setText(verdict, "Civilians win");
    verdict.className = "eyebrow verdict-win";
  }

  typeWord($("result-word"), msg.word);
  setText(
    $("result-decoy"),
    msg.mode === "decoy" && msg.decoyWord
      ? `Decoy word: ${msg.decoyWord}`
      : ""
  );

  setText($("result-imposters"), (msg.imposters || []).join(" · ") || "—");

  let detail = "";
  if (msg.reason === "imposters_left") detail = "The imposter(s) left the game.";
  else if (msg.eliminatedName)
    detail = `${msg.eliminatedName} was voted out.`;
  else detail = "No majority — nobody was voted out.";
  if (msg.lastStandGuessed === true) detail += " They guessed the word and survived.";
  else if (msg.lastStandGuessed === false) detail += " Last-stand guess failed.";
  setText($("result-detail"), detail);

  // staggered vote breakdown
  const votes = $("result-votes");
  votes.replaceChildren();
  (msg.votes || []).forEach((v, i) => {
    const li = makeEl("li");
    li.style.animationDelay = REDUCED_MOTION ? "0s" : i * 0.3 + "s";
    li.appendChild(makeEl("span", null, v.voter));
    li.appendChild(makeEl("span", "arrow", "→"));
    li.appendChild(makeEl("span", null, v.target));
    votes.appendChild(li);
  });
  if (!(msg.votes || []).length)
    votes.appendChild(makeEl("li", "muted", "No votes cast."));

  // scoreboard (sorted)
  const sb = $("scoreboard");
  sb.replaceChildren();
  const sorted = [...(msg.scores || [])].sort((a, b) => b.score - a.score);
  const top = sorted.length ? sorted[0].score : 0;
  for (const s of sorted) {
    const li = makeEl("li", s.score === top && top > 0 ? "lead" : "");
    li.appendChild(makeEl("span", null, s.name));
    li.appendChild(makeEl("span", "pts", s.score));
    sb.appendChild(li);
  }

  const btn = $("btn-next-round");
  if (isHost()) {
    btn.hidden = false;
    setText(btn, msg.isFinalRound ? "Back to lobby" : "Next round");
    setText($("result-wait"), "");
  } else {
    btn.hidden = true;
    setText(
      $("result-wait"),
      msg.isFinalRound ? "Final round. Waiting for host…" : "Waiting for host…"
    );
  }
}

/* ============================================================ CATCHUP ==== */
function onCatchup(msg) {
  state.phase = msg.phase;
  state.players = msg.players;
  state.host = msg.host;
  state.settings = msg.settings;
  state.gameActive = msg.gameActive;
  state.roundMode = msg.mode;
  state.turnOrder = msg.turnOrder || [];
  state.currentTurn = msg.currentTurn;

  if (msg.phase === "LOBBY") {
    show("lobby");
    renderLobby();
  } else if (msg.phase === "REVEAL") {
    show("reveal");
    renderReadyList();
  } else if (msg.phase === "CLUES") {
    renderClues();
    show("clues");
  } else if (msg.phase === "DISCUSSION") {
    state.timerContext = "discussion";
    enterDiscussion(msg.timerSeconds || 0);
  } else if (msg.phase === "VOTING") {
    state.timerContext = "voting";
    renderVoting();
    show("voting");
  } else if (msg.phase === "RESULT") {
    show("result");
    setText($("result-wait"), "Round in progress…");
  }
  $("conn-banner").hidden = true;
  toast("Reconnected");
}

/* ============================================================ OFFLINE ==== */
const off = {
  players: 5,
  imposterCount: 1,
  mode: "classic",
  category: "Random",
  roles: [], // [{name, role, word}]
  index: 0,
  used: new Set(),
  word: "",
  decoy: null,
  imposters: [],
};

function offlineDeal() {
  off.players = Number($("off-players").value);
  off.imposterCount = Number(
    document.querySelector("#off-imposter-seg .seg-btn.active").dataset.val
  );
  off.mode = document.querySelector("#off-mode-seg .seg-btn.active").dataset.val;
  off.category = $("off-category").value;

  const impCount = Math.min(
    off.imposterCount,
    Math.max(1, Math.floor(off.players / 3))
  );
  const pick = pickWordsLocal(off.category, off.mode === "decoy", off.used);
  off.used.add(pick.civilianWord);
  if (pick.decoyWord) off.used.add(pick.decoyWord);
  if (off.used.size > 200) off.used.clear();
  off.word = pick.civilianWord;
  off.decoy = pick.decoyWord;

  const idx = [...Array(off.players).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const imposterSet = new Set(idx.slice(0, impCount));
  off.imposters = [];
  off.roles = [];
  for (let i = 0; i < off.players; i++) {
    const isImp = imposterSet.has(i);
    if (isImp) off.imposters.push(`Player ${i + 1}`);
    off.roles.push({
      name: `Player ${i + 1}`,
      role: isImp ? "imposter" : "civilian",
      word:
        off.mode === "decoy"
          ? isImp
            ? off.decoy
            : off.word
          : isImp
          ? null
          : off.word,
    });
  }
  off.index = 0;
  offlineShowPass();
  show("offline-reveal");
}

let offRevealLockUntil = 0;
function offlineShowPass() {
  const r = off.roles[off.index];
  setText($("off-pass-name"), `Pass to ${r.name}`);
  setText($("off-current-name"), r.name);
  $("off-overlay").hidden = true;
}
function offlineReveal() {
  const r = off.roles[off.index];
  const wordEl = $("off-reveal-word");
  wordEl.classList.remove("imposter");
  let display;
  if (off.mode === "classic" && r.role === "imposter") {
    display = "IMPOSTER";
    wordEl.classList.add("imposter");
    setText($("off-reveal-label"), "You are the");
    setText(
      $("off-reveal-sub"),
      off.category !== "Random" ? "Category: " + off.category : "Blend in."
    );
  } else {
    display = r.word;
    setText($("off-reveal-label"), "Your word");
    setText($("off-reveal-sub"), "");
  }
  $("off-overlay").hidden = false;
  // The reveal button and the overlay's "Got it" button overlap on screen, so a
  // tap's synthesized ghost-click (~300ms later) would land on "Got it" and
  // instantly dismiss the word. Ignore dismissals for a moment after opening.
  offRevealLockUntil = Date.now() + 500;
  Sound.reveal();
  typeWord(wordEl, display);
}
function offlineNext() {
  if (Date.now() < offRevealLockUntil) return; // swallow ghost-click dismiss
  off.index++;
  if (off.index >= off.roles.length) {
    offlineShowAnswerScreen();
  } else {
    offlineShowPass();
  }
}
function offlineShowAnswerScreen() {
  $("off-answer").hidden = true;
  show("offline-result");
}
function offlineRevealAnswer() {
  setText($("off-answer-word"), off.word);
  setText(
    $("off-answer-decoy"),
    off.decoy ? "Decoy word: " + off.decoy : ""
  );
  setText($("off-answer-imposters"), off.imposters.join(" · "));
  $("off-answer").hidden = false;
  typeWord($("off-answer-word"), off.word);
}

/* ============================================================ SHARE ====== */
function shareUrl() {
  return `${location.origin}/?room=${state.code}`;
}
async function copyLink() {
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    toast(url);
  }
}
async function shareRoom() {
  const url = shareUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: "Suss", text: "Join my Suss game", url });
    } catch {}
  } else {
    copyLink();
  }
}

/* ============================================================ START ONLINE */
function startOnline(intent, code) {
  state.mode = "online";
  state.intent = intent;
  state.code = code;
  setText($("name-context"), intent === "create" ? "Creating room" : "Joining room");
  show("name");
  setTimeout(() => $("name-input").focus(), 60);
}
function goWithName() {
  const name = $("name-input").value.trim();
  if (!name) {
    setText($("name-error"), "Enter a name to continue.");
    return;
  }
  setText($("name-error"), "");
  state.name = name;
  state.leaving = false;
  connect();
}

/* ============================================================ CATEGORIES = */
function fillCategories() {
  const names = ["Random", ...window.SUSS_WORDS.map((c) => c.name)];
  for (const id of ["category-select", "off-category"]) {
    const sel = $(id);
    if (!sel) continue;
    sel.replaceChildren();
    for (const n of names) {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    }
  }
}

/* ============================================================ WIRE UP ==== */
function wire() {
  // Home
  $("btn-create").addEventListener("click", () => startOnline("create", genCode()));
  $("btn-join").addEventListener("click", () => {
    const code = $("join-code").value.trim().toUpperCase();
    if (!validCode(code)) {
      setText($("home-error"), "Enter a valid 4-character code.");
      return;
    }
    setText($("home-error"), "");
    startOnline("join", code);
  });
  $("join-code").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  $("btn-offline").addEventListener("click", () => {
    state.mode = "offline";
    show("offline-setup");
  });

  // back links
  document.querySelectorAll("[data-back]").forEach((b) =>
    b.addEventListener("click", () => show(b.dataset.back))
  );

  // Name
  $("btn-name-go").addEventListener("click", goWithName);
  $("name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") goWithName();
  });

  // Lobby settings (host)
  document
    .querySelectorAll('.setting[data-setting] .seg-btn')
    .forEach((b) => {
      b.addEventListener("click", () => {
        if (!isHost()) return;
        const setting = b.closest(".setting").dataset.setting;
        const val = b.dataset.val;
        if (setting === "mode") pushSettings({ mode: val });
        else if (setting === "imposterCount")
          pushSettings({ imposterCount: Number(val) });
        else if (setting === "discussionTimer")
          pushSettings({ discussionTimer: Number(val) });
        else if (setting === "rounds") pushSettings({ rounds: Number(val) });
        else if (setting === "imposterHint")
          pushSettings({ imposterHint: val === "on" });
      });
    });
  $("category-select").addEventListener("change", (e) => {
    if (isHost()) pushSettings({ category: e.target.value });
  });
  $("btn-start").addEventListener("click", () =>
    send({ type: "start_game", settings: state.settings })
  );
  $("btn-copy-link").addEventListener("click", copyLink);
  $("btn-share").addEventListener("click", shareRoom);
  $("btn-leave").addEventListener("click", leaveGame);
  $("btn-sound").addEventListener("click", () => Sound.toggle());

  // Reveal
  $("btn-reveal-card").addEventListener("click", openReveal);
  $("btn-ready").addEventListener("click", confirmReady);

  // Clues / discussion
  $("btn-clue-done").addEventListener("click", () =>
    send({ type: "clue_done" })
  );
  $("btn-end-discussion").addEventListener("click", () =>
    send({ type: "end_discussion" })
  );

  // Result
  $("btn-next-round").addEventListener("click", () =>
    send({ type: "next_round" })
  );
  $("btn-result-leave").addEventListener("click", leaveGame);
  $("btn-laststand-go").addEventListener("click", submitLastStand);
  $("laststand-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitLastStand();
  });

  // Offline
  $("off-players").addEventListener("input", (e) =>
    setText($("off-player-count"), e.target.value)
  );
  document.querySelectorAll("#off-imposter-seg .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("#off-imposter-seg .seg-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    })
  );
  document.querySelectorAll("#off-mode-seg .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("#off-mode-seg .seg-btn")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
    })
  );
  $("btn-offline-start").addEventListener("click", offlineDeal);
  $("off-reveal-tap").addEventListener("click", offlineReveal);
  $("off-reveal-next").addEventListener("click", offlineNext);
  $("off-show-answer").addEventListener("click", offlineRevealAnswer);
  $("off-replay").addEventListener("click", offlineDeal);

  // resume audio on first gesture (so sound works when enabled)
  document.addEventListener(
    "pointerdown",
    () => {
      if (Sound.on) Sound.ensure();
    },
    { once: true }
  );
}

/* ============================================================ BOOT ======= */
function readRoomFromUrl() {
  const q = new URLSearchParams(location.search).get("room");
  if (q && validCode(q.toUpperCase())) return q.toUpperCase();
  const seg = location.pathname.replace(/\//g, "");
  if (validCode(seg.toUpperCase())) return seg.toUpperCase();
  return null;
}

// On localhost a cached service worker would serve stale code (and mask every
// update) — so in dev we unregister any SW and wipe its caches, reloading once
// to pick up fresh files. In production we register a network-first SW so
// deployed updates always reach players while offline play still works.
function manageServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const h = location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h === "";
  if (isLocal) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        const had = regs.length > 0;
        return Promise.all(regs.map((r) => r.unregister()))
          .then(() =>
            window.caches
              ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
              : null
          )
          .then(() => {
            if (had) location.reload();
          });
      })
      .catch(() => {});
  } else if (location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function boot() {
  Sound.init();
  fillCategories();
  wire();
  const code = readRoomFromUrl();
  if (code) startOnline("join", code);
  else show("home");
  manageServiceWorker();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot);
else boot();
