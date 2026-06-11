// Suss — Partykit server (room logic + state machine).
//
// SECURITY / PRIVACY MODEL
// - State is held in instance memory ONLY. We never touch this.room.storage,
//   so nothing is persisted; when the room empties and the Durable Object is
//   evicted, all state (names, roles, votes, scores) is gone for good.
// - The secret word and role assignments are NEVER broadcast. Each player is
//   told only their own role/word via a private `your_role` message. The word
//   is revealed to everyone only in the `result` message after the round ends.
// - In Decoy mode the imposter is told role:"civilian" with the decoy word, so
//   nothing on their screen (or in their network traffic) reveals they are the
//   imposter. The true assignment lives only here on the server.
// - All client input is treated as untrusted: messages are validated, display
//   names are sanitized and length-capped, vote targets are checked.

import type * as Party from "partykit/server";
import {
  pickWords,
  CATEGORY_NAMES,
  type WordPick,
} from "./words";

type Phase = "LOBBY" | "REVEAL" | "CLUES" | "DISCUSSION" | "VOTING" | "RESULT";
type Mode = "classic" | "decoy";

interface Settings {
  imposterCount: number; // 1-3, auto-clamped to floor(players/3)
  mode: Mode;
  category: string; // category name or "Random"
  discussionTimer: number; // seconds; 0 = unlimited
  rounds: number; // 1,3,5,7,10
  imposterHint: boolean; // classic only: show category to imposter
}

interface Player {
  id: string;
  name: string;
  connected: boolean;
  joinOrder: number;
  score: number;
  // per-round
  role: "civilian" | "imposter";
  word: string | null; // what THIS player sees (civilian/decoy word, or null)
  ready: boolean;
  vote: string | null;
  eliminated: boolean;
}

const MAX_PLAYERS = 20;
const MIN_PLAYERS = 4;
const NAME_MAX = 20;
const RECONNECT_HOLD_MS = 60_000;
const HOST_TRANSFER_MS = 30_000;
const VOTE_TIMER_S = 30;
const LAST_STAND_S = 15;
const REVEAL_MIN_S = 4;

const ALLOWED_TIMERS = new Set([0, 30, 60, 90]);
const ALLOWED_ROUNDS = new Set([1, 3, 5, 7, 10]);

const DEFAULT_SETTINGS: Settings = {
  imposterCount: 1,
  mode: "classic",
  category: "Random",
  discussionTimer: 60,
  rounds: 3,
  imposterHint: false,
};

function sanitizeName(raw: unknown): string {
  let s = typeof raw === "string" ? raw : "";
  // strip control chars / line breaks, collapse whitespace, trim, cap length
  s = s
    .split("")
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX);
  if (s.length === 0) s = "Player";
  return s;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeWord(s: unknown): string {
  return (typeof s === "string" ? s : "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export default class SussServer implements Party.Server {
  // Hibernation is fine: connections keep the DO alive during a game, and we
  // explicitly want everything discarded once it ends.
  static options = { hibernate: false };

  players = new Map<string, Player>();
  hostId: string | null = null;
  phase: Phase = "LOBBY";
  settings: Settings = { ...DEFAULT_SETTINGS };
  round = 0;
  nextJoinOrder = 0;

  // per-round secret state (server-only)
  category = "";
  civilianWord = "";
  decoyWord: string | null = null;
  imposterIds = new Set<string>();
  usedWords = new Set<string>();

  turnOrder: string[] = [];
  turnIndex = 0;

  gameActive = false; // joins are locked while a game is in progress

  // last stand
  lastStandImposter: string | null = null;

  // timers
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private phaseTimeout: ReturnType<typeof setTimeout> | null = null;
  private timerEndsAt = 0;
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private hostTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  // ---------------------------------------------------------------- lifecycle

  onConnect(conn: Party.Connection) {
    const existing = this.players.get(conn.id);
    if (existing) {
      // Reconnection within the hold window: resume the player's seat.
      const t = this.disconnectTimers.get(conn.id);
      if (t) {
        clearTimeout(t);
        this.disconnectTimers.delete(conn.id);
      }
      existing.connected = true;
      this.send(conn.id, { type: "your_id", id: conn.id });
      this.sendStateCatchup(conn.id);
      this.broadcastLobby();
    }
    // Brand-new connections do nothing until they send a `join`.
  }

  onMessage(raw: string, sender: Party.Connection) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;

    switch (msg.type) {
      case "join":
        return this.handleJoin(sender, msg);
      case "start_game":
        return this.handleStartGame(sender, msg);
      case "revealed":
        return this.handleRevealed(sender);
      case "clue_done":
        return this.handleClueDone(sender);
      case "end_discussion":
        return this.handleEndDiscussion(sender);
      case "vote":
        return this.handleVote(sender, msg);
      case "imposter_guess":
        return this.handleImposterGuess(sender, msg);
      case "next_round":
        return this.handleNextRound(sender);
      case "kick":
        return this.handleKick(sender, msg);
      case "update_settings":
        return this.handleUpdateSettings(sender, msg);
      default:
        return;
    }
  }

  onClose(conn: Party.Connection) {
    this.handleDisconnect(conn.id);
  }

  onError(conn: Party.Connection) {
    this.handleDisconnect(conn.id);
  }

  // ------------------------------------------------------------------ senders

  private send(id: string, data: unknown) {
    this.room.getConnection(id)?.send(JSON.stringify(data));
  }

  private broadcast(data: unknown) {
    this.room.broadcast(JSON.stringify(data));
  }

  private publicPlayers() {
    return [...this.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        ready: p.ready,
        score: p.score,
        eliminated: p.eliminated,
        isHost: p.id === this.hostId,
      }));
  }

  private broadcastLobby() {
    this.broadcast({
      type: "lobby_update",
      players: this.publicPlayers(),
      host: this.hostId,
      settings: this.settings,
      phase: this.phase,
      round: this.round,
      totalRounds: this.settings.rounds,
      gameActive: this.gameActive,
      minPlayers: MIN_PLAYERS,
    });
  }

  // ------------------------------------------------------------------- joins

  private handleJoin(sender: Party.Connection, msg: any) {
    const existing = this.players.get(sender.id);

    // Joins are locked once a game starts (unless you already have a seat).
    if (this.gameActive && !existing) {
      this.send(sender.id, {
        type: "error",
        code: "in_progress",
        message: "Game in progress. Wait for the next round.",
      });
      return;
    }

    if (!existing && this.players.size >= MAX_PLAYERS) {
      this.send(sender.id, {
        type: "error",
        code: "room_full",
        message: "Room is full (20 players max).",
      });
      return;
    }

    const name = this.dedupeName(sanitizeName(msg.name), sender.id);

    if (existing) {
      existing.name = name;
      existing.connected = true;
    } else {
      const isFirst = this.players.size === 0;
      this.players.set(sender.id, {
        id: sender.id,
        name,
        connected: true,
        joinOrder: this.nextJoinOrder++,
        score: 0,
        role: "civilian",
        word: null,
        ready: false,
        vote: null,
        eliminated: false,
      });
      if (isFirst || this.hostId === null) this.hostId = sender.id;
    }

    this.send(sender.id, { type: "your_id", id: sender.id });
    this.broadcastLobby();
  }

  private dedupeName(name: string, selfId: string): string {
    const taken = new Set(
      [...this.players.values()]
        .filter((p) => p.id !== selfId)
        .map((p) => p.name.toLowerCase())
    );
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; n < 100; n++) {
      const candidate = `${name} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name} ${Math.floor(Math.random() * 1000)}`;
  }

  // -------------------------------------------------------------- settings

  private handleUpdateSettings(sender: Party.Connection, msg: any) {
    if (sender.id !== this.hostId) return;
    if (this.phase !== "LOBBY") return;
    this.settings = this.clampSettings(msg.settings, this.players.size);
    this.broadcastLobby();
  }

  private clampSettings(input: any, playerCount: number): Settings {
    const s = input && typeof input === "object" ? input : {};
    const maxImposters = Math.max(1, Math.floor(playerCount / 3));
    const mode: Mode = s.mode === "decoy" ? "decoy" : "classic";
    const category =
      typeof s.category === "string" &&
      (s.category === "Random" || CATEGORY_NAMES.includes(s.category))
        ? s.category
        : "Random";
    const reqImp = Number(s.imposterCount);
    const imposterCount = Math.min(
      Math.max(1, Number.isFinite(reqImp) ? Math.floor(reqImp) : 1),
      Math.min(3, maxImposters)
    );
    const reqTimer = Number(s.discussionTimer);
    const discussionTimer = ALLOWED_TIMERS.has(reqTimer) ? reqTimer : 60;
    const reqRounds = Number(s.rounds);
    const rounds = ALLOWED_ROUNDS.has(reqRounds) ? reqRounds : 3;
    const imposterHint = Boolean(s.imposterHint) && mode === "classic";
    return { imposterCount, mode, category, discussionTimer, rounds, imposterHint };
  }

  // ------------------------------------------------------------- start game

  private handleStartGame(sender: Party.Connection, msg: any) {
    if (sender.id !== this.hostId) return;
    if (this.phase !== "LOBBY") return;

    const connectedCount = [...this.players.values()].filter(
      (p) => p.connected
    ).length;
    if (connectedCount < MIN_PLAYERS) {
      this.send(sender.id, {
        type: "error",
        code: "not_enough_players",
        message: `Need at least ${MIN_PLAYERS} players to start.`,
      });
      return;
    }

    if (msg.settings) {
      this.settings = this.clampSettings(msg.settings, connectedCount);
    } else {
      // re-clamp existing settings to the current player count
      this.settings = this.clampSettings(this.settings, connectedCount);
    }

    this.gameActive = true;
    this.round = 0;
    for (const p of this.players.values()) p.score = 0;
    this.usedWords.clear();
    this.startRound();
  }

  // ----------------------------------------------------------------- rounds

  private startRound() {
    this.clearTimers();
    this.round += 1;
    this.phase = "REVEAL";
    this.lastStandImposter = null;

    const roster = [...this.players.values()].filter((p) => p.connected);

    // Reset per-round state.
    for (const p of this.players.values()) {
      p.role = "civilian";
      p.word = null;
      p.ready = false;
      p.vote = null;
      p.eliminated = false;
    }

    // Assign words.
    const pick: WordPick = pickWords({
      category: this.settings.category,
      decoy: this.settings.mode === "decoy",
      used: this.usedWords,
    });
    this.category = pick.category;
    this.civilianWord = pick.civilianWord;
    this.decoyWord = pick.decoyWord;
    this.usedWords.add(pick.civilianWord);
    if (pick.decoyWord) this.usedWords.add(pick.decoyWord);
    // Pool exhausted? silent reset.
    if (this.usedWords.size > 200) this.usedWords.clear();

    // Assign imposters.
    const impCount = Math.min(
      this.settings.imposterCount,
      Math.max(1, Math.floor(roster.length / 3))
    );
    const shuffled = shuffle(roster.map((p) => p.id));
    this.imposterIds = new Set(shuffled.slice(0, impCount));

    // Turn order (randomized; reused for clue phase).
    this.turnOrder = shuffle(roster.map((p) => p.id));
    this.turnIndex = 0;

    // Assign and privately send each player their role/word.
    for (const p of roster) {
      const isImposter = this.imposterIds.has(p.id);
      p.role = isImposter ? "imposter" : "civilian";

      if (this.settings.mode === "decoy") {
        // Imposter believes they are a civilian holding the decoy word.
        p.word = isImposter ? this.decoyWord : this.civilianWord;
        this.send(p.id, {
          type: "your_role",
          role: "civilian", // deliberately hidden from the imposter
          word: p.word,
          relatedWord: null,
          mode: "decoy",
        });
      } else {
        // Classic: imposter gets no word (and optional category hint).
        p.word = isImposter ? null : this.civilianWord;
        this.send(p.id, {
          type: "your_role",
          role: p.role,
          word: p.word,
          relatedWord: null,
          mode: "classic",
          categoryHint:
            isImposter && this.settings.imposterHint ? this.category : null,
        });
      }
    }

    // Auto-ready anyone who is currently disconnected so we never stall.
    for (const p of this.players.values()) {
      if (!p.connected) p.ready = true;
    }

    this.broadcast({
      type: "game_start",
      phase: "REVEAL",
      round: this.round,
      totalRounds: this.settings.rounds,
      turnOrder: this.turnOrder.map((id) => this.players.get(id)?.name ?? "?"),
      mode: this.settings.mode,
    });
    this.broadcastLobby();
  }

  // ----------------------------------------------------------- reveal phase

  private handleRevealed(sender: Party.Connection) {
    if (this.phase !== "REVEAL") return;
    const p = this.players.get(sender.id);
    if (!p) return;
    p.ready = true;
    this.broadcast({
      type: "ready_update",
      players: this.publicPlayers(),
    });
    this.maybeAdvanceFromReveal();
  }

  private maybeAdvanceFromReveal() {
    const allReady = [...this.players.values()].every(
      (p) => p.ready || !p.connected
    );
    if (allReady) this.enterClues();
  }

  // ------------------------------------------------------------- clue phase

  private enterClues() {
    this.clearTimers();
    this.phase = "CLUES";
    this.turnIndex = 0;
    // skip any leading disconnected players
    this.advanceTurnPastDisconnected();
    this.emitCluePhase();
  }

  private emitCluePhase() {
    const currentId = this.turnOrder[this.turnIndex] ?? null;
    this.broadcast({
      type: "phase_change",
      phase: "CLUES",
      turnOrder: this.turnOrder
        .map((id) => this.players.get(id))
        .filter((p): p is Player => !!p)
        .map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
      currentTurn: currentId,
      turnIndex: this.turnIndex,
    });
  }

  private advanceTurnPastDisconnected() {
    while (
      this.turnIndex < this.turnOrder.length &&
      !this.players.get(this.turnOrder[this.turnIndex])?.connected
    ) {
      this.turnIndex++;
    }
  }

  private handleClueDone(sender: Party.Connection) {
    if (this.phase !== "CLUES") return;
    const currentId = this.turnOrder[this.turnIndex];
    // Only the current player (or host, as a fallback) may advance the turn.
    if (sender.id !== currentId && sender.id !== this.hostId) return;
    this.turnIndex++;
    this.advanceTurnPastDisconnected();
    if (this.turnIndex >= this.turnOrder.length) {
      this.enterDiscussion();
    } else {
      this.emitCluePhase();
    }
  }

  // -------------------------------------------------------- discussion phase

  private enterDiscussion() {
    this.clearTimers();
    this.phase = "DISCUSSION";
    const secs = this.settings.discussionTimer;
    this.broadcast({ type: "phase_change", phase: "DISCUSSION", seconds: secs });
    if (secs > 0) {
      this.startTimer(secs, () => this.enterVoting());
    }
  }

  private handleEndDiscussion(sender: Party.Connection) {
    if (this.phase !== "DISCUSSION") return;
    if (sender.id !== this.hostId) return;
    this.enterVoting();
  }

  // ------------------------------------------------------------ voting phase

  private enterVoting() {
    this.clearTimers();
    this.phase = "VOTING";
    for (const p of this.players.values()) p.vote = null;
    this.broadcast({
      type: "phase_change",
      phase: "VOTING",
      seconds: VOTE_TIMER_S,
      players: this.publicPlayers(),
    });
    this.startTimer(VOTE_TIMER_S, () => this.resolveVotes());
  }

  private handleVote(sender: Party.Connection, msg: any) {
    if (this.phase !== "VOTING") return;
    const voter = this.players.get(sender.id);
    if (!voter || !voter.connected) return;
    const target = typeof msg.target === "string" ? msg.target : null;
    // can't vote for yourself or for a non-player
    if (!target || target === sender.id || !this.players.has(target)) return;
    voter.vote = target;

    const voters = [...this.players.values()].filter((p) => p.connected);
    const votedCount = voters.filter((p) => p.vote !== null).length;
    this.broadcast({
      type: "vote_update",
      votedCount,
      totalPlayers: voters.length,
    });
    if (votedCount >= voters.length) this.resolveVotes();
  }

  private resolveVotes() {
    this.clearTimers();
    // Tally only votes from currently-connected players.
    const tally = new Map<string, number>();
    const breakdown: { voter: string; target: string }[] = [];
    for (const p of this.players.values()) {
      if (!p.connected || !p.vote) continue;
      if (!this.players.has(p.vote)) continue;
      tally.set(p.vote, (tally.get(p.vote) ?? 0) + 1);
      breakdown.push({ voter: p.name, target: this.players.get(p.vote)!.name });
    }

    let eliminatedId: string | null = null;
    let max = 0;
    let tie = false;
    for (const [id, count] of tally) {
      if (count > max) {
        max = count;
        eliminatedId = id;
        tie = false;
      } else if (count === max) {
        tie = true;
      }
    }
    if (tie || max === 0) eliminatedId = null;

    // If every imposter has already left, civilians win by default.
    const connectedImposters = [...this.imposterIds].filter(
      (id) => this.players.get(id)?.connected
    );
    if (connectedImposters.length === 0) {
      this.concludeRound(null, breakdown, "imposters_left");
      return;
    }

    if (eliminatedId && this.imposterIds.has(eliminatedId)) {
      // An imposter was caught -> Last Stand before concluding.
      this.startLastStand(eliminatedId, breakdown);
    } else {
      this.concludeRound(eliminatedId, breakdown, null);
    }
  }

  // -------------------------------------------------------------- last stand

  private startLastStand(imposterId: string, breakdown: any) {
    this.clearTimers();
    // Leave VOTING immediately: votes are already tallied, and a vote arriving
    // during the last stand must not re-trigger resolveVotes (which would
    // start a second last stand or double-broadcast the result and scores).
    this.phase = "RESULT";
    this.lastStandImposter = imposterId;
    this.pendingBreakdown = breakdown;
    const imp = this.players.get(imposterId);
    if (!imp || !imp.connected) {
      // Imposter is gone; treat as a failed last stand.
      this.concludeRound(imposterId, breakdown, null, { guessed: false });
      return;
    }
    // Tell the caught imposter privately; everyone else sees a waiting screen.
    this.send(imposterId, {
      type: "last_stand",
      seconds: LAST_STAND_S,
      category: this.category,
    });
    this.broadcast({
      type: "phase_change",
      phase: "RESULT",
      sub: "last_stand_wait",
      caught: imp.name,
      seconds: LAST_STAND_S,
    });
    this.startTimer(LAST_STAND_S, () =>
      this.concludeRound(imposterId, breakdown, null, { guessed: false })
    );
  }

  private pendingBreakdown: any = null;

  private handleImposterGuess(sender: Party.Connection, msg: any) {
    if (this.phase !== "VOTING" && this.phase !== "RESULT") return;
    if (sender.id !== this.lastStandImposter) return;
    const correct = normalizeWord(msg.word) === normalizeWord(this.civilianWord);
    this.send(sender.id, {
      type: "imposter_guess_result",
      correct,
      word: this.civilianWord,
    });
    this.concludeRound(sender.id, this.pendingBreakdown, null, {
      guessed: correct,
    });
  }

  // -------------------------------------------------------------- conclusion

  private concludeRound(
    eliminatedId: string | null,
    breakdown: any,
    reason: string | null,
    lastStand?: { guessed: boolean }
  ) {
    this.clearTimers();
    this.phase = "RESULT";
    this.lastStandImposter = null;

    const eliminated = eliminatedId ? this.players.get(eliminatedId) : null;
    const eliminatedIsImposter = eliminatedId
      ? this.imposterIds.has(eliminatedId)
      : false;
    const decoy = this.settings.mode === "decoy";

    // Decide the round winner and award scores.
    let impostersWin: boolean;
    if (reason === "imposters_left") {
      impostersWin = false;
    } else if (!eliminatedId) {
      // No majority -> imposters slip through.
      impostersWin = true;
    } else if (eliminatedIsImposter) {
      // Imposter caught: civilians win unless the last-stand guess was correct.
      impostersWin = Boolean(lastStand?.guessed);
    } else {
      // A civilian was voted out.
      impostersWin = true;
    }

    // Scoring.
    if (impostersWin) {
      for (const id of this.imposterIds) {
        const imp = this.players.get(id);
        if (!imp) continue;
        if (lastStand?.guessed && id === eliminatedId) {
          imp.score += 75; // caught but guessed the word
        } else if (id !== eliminatedId) {
          imp.score += decoy ? 200 : 150; // survived
        }
      }
    } else {
      // Civilians who voted for an imposter score.
      for (const p of this.players.values()) {
        if (this.imposterIds.has(p.id)) continue;
        if (p.vote && this.imposterIds.has(p.vote)) {
          p.score += decoy ? 150 : 100;
        }
      }
    }

    if (eliminated) eliminated.eliminated = true;

    const isFinalRound = this.round >= this.settings.rounds;

    this.broadcast({
      type: "result",
      word: this.civilianWord,
      decoyWord: this.decoyWord,
      category: this.category,
      mode: this.settings.mode,
      imposters: [...this.imposterIds]
        .map((id) => this.players.get(id)?.name)
        .filter(Boolean),
      imposterIds: [...this.imposterIds],
      eliminated: eliminatedId,
      eliminatedName: eliminated?.name ?? null,
      impostersWin,
      reason,
      lastStandGuessed: lastStand?.guessed ?? null,
      votes: breakdown ?? [],
      scores: this.publicPlayers().map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
      })),
      round: this.round,
      totalRounds: this.settings.rounds,
      isFinalRound,
    });
    this.broadcastLobby();
  }

  private handleNextRound(sender: Party.Connection) {
    if (sender.id !== this.hostId) return;
    if (this.phase !== "RESULT") return;
    if (this.round >= this.settings.rounds) {
      // Game over -> back to lobby.
      this.gameActive = false;
      this.phase = "LOBBY";
      this.round = 0;
      this.imposterIds.clear();
      for (const p of this.players.values()) {
        p.ready = false;
        p.vote = null;
        p.eliminated = false;
        p.word = null;
      }
      this.broadcast({ type: "phase_change", phase: "LOBBY" });
      this.broadcastLobby();
    } else {
      this.startRound();
    }
  }

  // -------------------------------------------------------------------- kick

  private handleKick(sender: Party.Connection, msg: any) {
    if (sender.id !== this.hostId) return;
    const target = typeof msg.target === "string" ? msg.target : null;
    if (!target || target === this.hostId || !this.players.has(target)) return;
    const name = this.players.get(target)!.name;
    this.removePlayer(target, true);
    // Notify the kicked player, THEN tear down their socket. Broadcasts must
    // happen before we close the connection — room.broadcast() iterates live
    // connections, and sending to an already-closed socket throws.
    const conn = this.room.getConnection(target);
    try {
      conn?.send(JSON.stringify({ type: "kicked" }));
    } catch {}
    this.broadcast({ type: "player_left", id: target, name, kicked: true });
    this.broadcastLobby();
    try {
      conn?.close();
    } catch {}
    this.checkGameIntegrity();
  }

  // ------------------------------------------------------------ disconnects

  private handleDisconnect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;

    // Host transfer timer.
    if (id === this.hostId) {
      if (this.hostTimer) clearTimeout(this.hostTimer);
      this.hostTimer = setTimeout(() => this.transferHost(id), HOST_TRANSFER_MS);
    }

    // During lobby, drop immediately. Mid-game, hold the seat for 60s.
    if (!this.gameActive) {
      this.removePlayer(id, false);
      this.broadcast({ type: "player_left", id, name: p.name });
      this.broadcastLobby();
      return;
    }

    // Mid-reveal: auto-mark ready so the game doesn't stall.
    if (this.phase === "REVEAL") {
      p.ready = true;
      this.maybeAdvanceFromReveal();
    }
    this.broadcastLobby();

    const existing = this.disconnectTimers.get(id);
    if (existing) clearTimeout(existing);
    this.disconnectTimers.set(
      id,
      setTimeout(() => {
        this.disconnectTimers.delete(id);
        const pl = this.players.get(id);
        if (!pl || pl.connected) return;
        this.removePlayer(id, false);
        this.broadcast({ type: "player_left", id, name: pl.name });
        this.broadcastLobby();
        this.checkGameIntegrity();
      }, RECONNECT_HOLD_MS)
    );

    // A disconnect can unblock the current phase.
    this.reevaluatePhaseAfterLeave(id);
  }

  private transferHost(prevHostId: string) {
    this.hostTimer = null;
    const prev = this.players.get(prevHostId);
    if (prev && prev.connected) return; // came back in time
    const next = [...this.players.values()]
      .filter((p) => p.connected && p.id !== prevHostId)
      .sort((a, b) => a.joinOrder - b.joinOrder)[0];
    this.hostId = next ? next.id : null;
    this.broadcastLobby();
  }

  private removePlayer(id: string, immediate: boolean) {
    const t = this.disconnectTimers.get(id);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(id);
    }
    const wasHost = id === this.hostId;
    this.players.delete(id);
    this.imposterIds.delete(id);
    // Removing an entry before the current position shifts the array left;
    // keep turnIndex pointing at the same (current) player.
    const ti = this.turnOrder.indexOf(id);
    if (ti !== -1 && ti < this.turnIndex) this.turnIndex--;
    this.turnOrder = this.turnOrder.filter((t) => t !== id);
    if (wasHost) {
      const next = [...this.players.values()]
        .filter((p) => p.connected)
        .sort((a, b) => a.joinOrder - b.joinOrder)[0];
      this.hostId = next ? next.id : null;
    }
  }

  private reevaluatePhaseAfterLeave(id: string) {
    if (this.phase === "REVEAL") {
      this.maybeAdvanceFromReveal();
    } else if (this.phase === "CLUES") {
      // If the current player left, skip to the next.
      if (this.turnOrder[this.turnIndex] === id) {
        this.advanceTurnPastDisconnected();
        if (this.turnIndex >= this.turnOrder.length) this.enterDiscussion();
        else this.emitCluePhase();
      }
    } else if (this.phase === "VOTING") {
      const voters = [...this.players.values()].filter((p) => p.connected);
      const votedCount = voters.filter((p) => p.vote !== null).length;
      if (voters.length > 0 && votedCount >= voters.length) this.resolveVotes();
    }
  }

  private checkGameIntegrity() {
    if (!this.gameActive) return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    // All imposters gone mid-round -> civilians win this round.
    const impostersLeft = [...this.imposterIds].some(
      (id) => this.players.get(id)?.connected
    );
    if (
      !impostersLeft &&
      (this.phase === "CLUES" ||
        this.phase === "DISCUSSION" ||
        this.phase === "VOTING")
    ) {
      this.concludeRound(null, [], "imposters_left");
      return;
    }
    // Too few players to continue -> end the game back to lobby.
    if (connected.length < MIN_PLAYERS && this.phase !== "RESULT") {
      this.gameActive = false;
      this.phase = "LOBBY";
      this.clearTimers();
      this.broadcast({
        type: "error",
        code: "too_few_players",
        message: "Too few players left. Back to lobby.",
      });
      this.broadcast({ type: "phase_change", phase: "LOBBY" });
      this.broadcastLobby();
    }
  }

  // -------------------------------------------------------------- catch-up

  private sendStateCatchup(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    // Re-send this player's private role for the active round.
    if (this.gameActive && this.phase !== "LOBBY") {
      const isImposter = this.imposterIds.has(id);
      if (this.settings.mode === "decoy") {
        this.send(id, {
          type: "your_role",
          role: "civilian",
          word: p.word,
          relatedWord: null,
          mode: "decoy",
        });
      } else {
        this.send(id, {
          type: "your_role",
          role: p.role,
          word: p.word,
          relatedWord: null,
          mode: "classic",
          categoryHint:
            isImposter && this.settings.imposterHint ? this.category : null,
        });
      }
    }
    // Full snapshot so the reconnecting client can rebuild its screen.
    this.send(id, {
      type: "state_catchup",
      phase: this.phase,
      round: this.round,
      totalRounds: this.settings.rounds,
      settings: this.settings,
      host: this.hostId,
      gameActive: this.gameActive,
      players: this.publicPlayers(),
      mode: this.settings.mode,
      turnOrder: this.turnOrder
        .map((tid) => this.players.get(tid))
        .filter((pl): pl is Player => !!pl)
        .map((pl) => ({ id: pl.id, name: pl.name, connected: pl.connected })),
      currentTurn: this.turnOrder[this.turnIndex] ?? null,
      timerSeconds:
        this.timerEndsAt > 0
          ? Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000))
          : null,
    });
  }

  // ---------------------------------------------------------------- timers

  private startTimer(seconds: number, onDone: () => void) {
    this.clearTimers();
    this.timerEndsAt = Date.now() + seconds * 1000;
    this.broadcast({ type: "timer", seconds });
    this.tickHandle = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((this.timerEndsAt - Date.now()) / 1000)
      );
      this.broadcast({ type: "timer", seconds: remaining });
      if (remaining <= 0 && this.tickHandle) {
        clearInterval(this.tickHandle);
        this.tickHandle = null;
      }
    }, 1000);
    this.phaseTimeout = setTimeout(() => {
      this.phaseTimeout = null;
      onDone();
    }, seconds * 1000 + 50);
  }

  private clearTimers() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
      this.phaseTimeout = null;
    }
    this.timerEndsAt = 0;
  }
}

