import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { db, questionsTable, categoriesTable, arenaStatsTable, userInventoryTable, marketplaceItemsTable, profilesTable, usersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { logger } from "./logger";
import { checkAndAwardBadges } from "../routes/badgeChecker";
import { supabase } from "./supabase";
import { getRatesForMode } from "./economyConfig";
import { awardBattlePassXp } from "../routes/xpHelper";

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TIME_MS = 20_000;
const RESULT_DISPLAY_MS = 3_000;
const BASE_POINTS = 100;
const SPEED_BONUS_MAX = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArenaPlayer {
  ws: WebSocket;
  userId: string;
  username: string;
  profileImageUrl: string | null;
}

export interface ArenaQuestion {
  id: string;
  question: string;
  questionType: string;
  imageUrl: string | null;
  options: string[];
  correctAnswer: number;
}

interface QuestionAnswer {
  correct: boolean;
  points: number;
  elapsedMs: number;
}

export interface ArenaRoom {
  id: string;
  code?: string;
  players: ArenaPlayer[];
  phase: "lobby" | "category_selection" | "game_loading" | "game" | "ended";
  categoriesSelected: Map<string, string[]>;
  questions: ArenaQuestion[];
  scores: Map<string, number>;
  readyPlayers: Set<string>;
  questionCount: number;
  isFriendsRoom: boolean;
  // Synchronized game state
  currentQuestionIndex: number;
  questionStartTime: number;
  questionAnswers: Map<string, QuestionAnswer | null>;
  questionTimer: ReturnType<typeof setTimeout> | null;
  questionActive: boolean;
  // Power-up state
  shields: Map<string, boolean>;
  stolenFrom: Set<string>;
}

// ─── In-memory state ──────────────────────────────────────────────────────────

const queue: ArenaPlayer[] = [];
const rooms = new Map<string, ArenaRoom>();
const friendRoomsByCode = new Map<string, string>();
const playerToRoom = new Map<string, string>();
const activePlayers = new Map<string, ArenaPlayer>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }
function friendCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function sendAll(room: ArenaRoom, data: object) {
  room.players.forEach(p => send(p.ws, data));
}

function sendAllExcept(room: ArenaRoom, excludeUserId: string, data: object) {
  room.players.filter(p => p.userId !== excludeUserId).forEach(p => send(p.ws, data));
}

function lobbyPayload(room: ArenaRoom) {
  const hostId = room.players[0]?.userId;
  return {
    type: "LOBBY_UPDATE",
    code: room.code,
    questionCount: room.questionCount,
    players: room.players.map(p => ({
      userId: p.userId,
      username: p.username,
      profileImageUrl: p.profileImageUrl,
      isReady: room.readyPlayers.has(p.userId),
      isHost: p.userId === hostId,
    })),
  };
}

// Shuffle options for MC/TF questions, adjust correctAnswer index
function shuffleQuestion(q: ArenaQuestion): ArenaQuestion {
  if (q.questionType !== "multiple_choice" && q.questionType !== "true_false") {
    return q;
  }
  const indices = q.options.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  const newOptions = indices.map(i => q.options[i]!);
  const newCorrectAnswer = indices.indexOf(q.correctAnswer);
  return { ...q, options: newOptions, correctAnswer: newCorrectAnswer };
}

function calcPoints(correct: boolean, elapsedMs: number): number {
  if (!correct) return 0;
  // Lose 1 bonus point every 500ms (max 150 → 100 at 25s, 110 at 20s)
  const steps = Math.floor(elapsedMs / 500);
  const speedBonus = Math.max(0, SPEED_BONUS_MAX - steps);
  return BASE_POINTS + speedBonus;
}

// ─── Matchmaking ──────────────────────────────────────────────────────────────

function removeFromQueue(ws: WebSocket) {
  const idx = queue.findIndex(p => p.ws === ws);
  if (idx !== -1) queue.splice(idx, 1);
}

function tryMatch() {
  if (queue.length < 2) return;
  const [p1, p2] = queue.splice(0, 2) as [ArenaPlayer, ArenaPlayer];
  createMatchmadeRoom(p1, p2);
}

function createMatchmadeRoom(p1: ArenaPlayer, p2: ArenaPlayer) {
  const roomId = uid();
  const room: ArenaRoom = {
    id: roomId,
    players: [p1, p2],
    phase: "category_selection",
    categoriesSelected: new Map(),
    questions: [],
    scores: new Map([[p1.userId, 0], [p2.userId, 0]]),
    readyPlayers: new Set(),
    questionCount: 12,
    isFriendsRoom: false,
    currentQuestionIndex: 0,
    questionStartTime: 0,
    questionAnswers: new Map(),
    questionTimer: null,
    questionActive: false,
    shields: new Map(),
    stolenFrom: new Set(),
  };
  rooms.set(roomId, room);
  playerToRoom.set(p1.userId, roomId);
  playerToRoom.set(p2.userId, roomId);

  const matchData = (self: ArenaPlayer, opp: ArenaPlayer) => ({
    type: "MATCH_FOUND",
    roomId,
    isFriendsRoom: false,
    self: { userId: self.userId, username: self.username, profileImageUrl: self.profileImageUrl },
    opponents: [{ userId: opp.userId, username: opp.username, profileImageUrl: opp.profileImageUrl }],
  });

  send(p1.ws, matchData(p1, p2));
  send(p2.ws, matchData(p2, p1));
  startCategorySelection(room);
}

// ─── Friends room ─────────────────────────────────────────────────────────────

function createFriendsRoom(creator: ArenaPlayer, questionCount: number): ArenaRoom {
  const roomId = uid();
  const code = friendCode();
  const room: ArenaRoom = {
    id: roomId,
    code,
    players: [creator],
    phase: "lobby",
    categoriesSelected: new Map(),
    questions: [],
    scores: new Map(),
    readyPlayers: new Set(),
    questionCount: Math.min(Math.max(questionCount, 5), 50),
    isFriendsRoom: true,
    currentQuestionIndex: 0,
    questionStartTime: 0,
    questionAnswers: new Map(),
    questionTimer: null,
    questionActive: false,
    shields: new Map(),
    stolenFrom: new Set(),
  };
  rooms.set(roomId, room);
  friendRoomsByCode.set(code, roomId);
  playerToRoom.set(creator.userId, roomId);

  send(creator.ws, { type: "ROOM_CREATED", code });
  sendAll(room, lobbyPayload(room));
  return room;
}

function joinFriendsRoom(player: ArenaPlayer, code: string) {
  const roomId = friendRoomsByCode.get(code);
  if (!roomId) {
    send(player.ws, { type: "ERROR", message: "Room not found. Check the code and try again." });
    return;
  }
  const room = rooms.get(roomId);
  if (!room) { send(player.ws, { type: "ERROR", message: "Room not found." }); return; }
  if (room.phase !== "lobby") { send(player.ws, { type: "ERROR", message: "This room has already started." }); return; }
  if (room.players.some(p => p.userId === player.userId)) { send(player.ws, { type: "ERROR", message: "You are already in this room." }); return; }
  if (room.players.length >= 6) { send(player.ws, { type: "ERROR", message: "Room is full (max 6 players)." }); return; }

  room.players.push(player);
  playerToRoom.set(player.userId, roomId);
  sendAll(room, lobbyPayload(room));
}

// ─── Category selection ───────────────────────────────────────────────────────

async function startCategorySelection(room: ArenaRoom) {
  room.phase = "category_selection";
  try {
    const cats = await db.select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      icon: categoriesTable.icon,
      color: categoriesTable.color,
      imageUrl: categoriesTable.imageUrl,
      parentId: categoriesTable.parentId,
    }).from(categoriesTable);

    if (!rooms.has(room.id)) return;

    sendAll(room, {
      type: "CATEGORY_SELECTION",
      categories: cats,
      isFriendsRoom: room.isFriendsRoom,
      questionCount: room.questionCount,
      opponents: room.players.map(p => ({
        userId: p.userId,
        username: p.username,
        profileImageUrl: p.profileImageUrl,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch categories for arena");
    if (rooms.has(room.id)) {
      sendAll(room, { type: "ERROR", message: "Failed to load categories" });
    }
  }
}

// ─── Game ─────────────────────────────────────────────────────────────────────

async function startGame(room: ArenaRoom) {
  const allCatIds = new Set<string>();
  room.categoriesSelected.forEach(cats => cats.forEach(c => allCatIds.add(c)));
  const categoryIds = [...allCatIds];

  const questionsPool: ArenaQuestion[] = [];
  const perCat = Math.ceil(room.questionCount / Math.max(categoryIds.length, 1));

  for (const catId of categoryIds) {
    const qs = await db.select().from(questionsTable).where(eq(questionsTable.categoryId, catId)).limit(perCat + 5);
    if (!rooms.has(room.id)) return;
    const shuffled = qs.sort(() => Math.random() - 0.5).slice(0, perCat);
    shuffled.forEach(q => {
      questionsPool.push(shuffleQuestion({
        id: q.id,
        question: q.question,
        questionType: q.questionType ?? "multiple_choice",
        imageUrl: q.imageUrl ?? null,
        options: (q.options as string[]) ?? [],
        correctAnswer: q.correctAnswer,
      }));
    });
  }

  if (!rooms.has(room.id)) return;
  const questions = questionsPool.sort(() => Math.random() - 0.5).slice(0, room.questionCount);
  room.questions = questions;
  room.phase = "game";
  room.scores = new Map(room.players.map(p => [p.userId, 0]));

  // Send all questions to clients WITHOUT correctAnswer (anti-cheat)
  const payload = questions.map(q => ({
    id: q.id,
    question: q.question,
    questionType: q.questionType,
    imageUrl: q.imageUrl,
    options: q.options,
  }));

  sendAll(room, { type: "GAME_START", questions: payload, total: payload.length });

  // Server controls progression — start question 0
  sendQuestion(room, 0);
}

// Server sends QUESTION_START to all players simultaneously
function sendQuestion(room: ArenaRoom, questionIndex: number) {
  if (room.phase !== "game") return;
  if (questionIndex >= room.questions.length) { endGame(room); return; }

  if (room.questionTimer) { clearTimeout(room.questionTimer); room.questionTimer = null; }

  room.currentQuestionIndex = questionIndex;
  room.questionStartTime = Date.now();
  room.questionAnswers = new Map(room.players.map(p => [p.userId, null]));
  room.questionActive = true;
  room.stolenFrom.clear();

  sendAll(room, { type: "QUESTION_START", questionIndex });

  // Auto-resolve if timer expires (anyone who hasn't answered gets 0)
  room.questionTimer = setTimeout(() => resolveQuestion(room), QUESTION_TIME_MS);
}

// Called when all players answered OR timer expired
function resolveQuestion(room: ArenaRoom) {
  if (room.phase !== "game") return;
  if (room.questionTimer) { clearTimeout(room.questionTimer); room.questionTimer = null; }
  room.questionActive = false;

  const qi = room.currentQuestionIndex;
  const q = room.questions[qi];
  if (!q) return;

  const results: Array<{ userId: string; username: string; correct: boolean; points: number; elapsedMs: number }> = [];
  room.players.forEach(p => {
    const ans = room.questionAnswers.get(p.userId);
    const correct = ans?.correct ?? false;
    const points = ans?.points ?? 0;
    const elapsedMs = ans?.elapsedMs ?? QUESTION_TIME_MS;
    results.push({ userId: p.userId, username: p.username, correct, points, elapsedMs });
  });

  sendAll(room, {
    type: "QUESTION_RESULT",
    questionIndex: qi,
    correctAnswer: q.correctAnswer,
    results,
    allScores: Object.fromEntries(room.scores),
  });

  // Advance to next question after display delay
  setTimeout(() => {
    if (!rooms.has(room.id)) return;
    const nextIndex = qi + 1;
    if (nextIndex >= room.questions.length) {
      endGame(room);
    } else {
      sendQuestion(room, nextIndex);
    }
  }, RESULT_DISPLAY_MS);
}

function scoreAnswer(q: ArenaQuestion, selected?: number, answerData?: string): boolean {
  const type = q.questionType;
  if (type === "ordering") {
    try {
      const player = JSON.parse(answerData ?? "[]") as number[];
      const correct = q.options.map((_, i) => i);
      return JSON.stringify(player) === JSON.stringify(correct);
    } catch { return false; }
  }
  if (type === "matching") {
    try {
      const playerMap = JSON.parse(answerData ?? "{}") as Record<string, string>;
      for (const opt of q.options) {
        const [left, right] = opt.split(":::");
        if (playerMap[left?.trim() ?? ""] !== right?.trim()) return false;
      }
      return true;
    } catch { return false; }
  }
  if (type === "hotspot") {
    try {
      const { x, y } = JSON.parse(answerData ?? "{}") as { x: number; y: number };
      const [x1, y1, x2, y2] = (q.options[0] ?? "0,0,100,100").split(",").map(Number);
      return x >= x1! && x <= x2! && y >= y1! && y <= y2!;
    } catch { return false; }
  }
  return selected === q.correctAnswer;
}

function handleAnswer(room: ArenaRoom, player: ArenaPlayer, questionIndex: number, selected?: number, answerData?: string) {
  if (room.phase !== "game") return;
  if (!room.questionActive) return;
  if (questionIndex !== room.currentQuestionIndex) return; // stale answer, ignore
  if (room.questionAnswers.get(player.userId) !== null) return; // already answered

  const q = room.questions[questionIndex];
  if (!q) return;

  const elapsedMs = Date.now() - room.questionStartTime;
  const correct = scoreAnswer(q, selected, answerData);
  const points = calcPoints(correct, elapsedMs);

  room.questionAnswers.set(player.userId, { correct, points, elapsedMs });
  room.scores.set(player.userId, (room.scores.get(player.userId) ?? 0) + points);

  // Speed badge: answered correctly under 4 seconds (server-measured)
  if (correct && elapsedMs < 4000) {
    checkAndAwardBadges(player.userId, { answerTimeMs: elapsedMs }).catch(() => {});
  }

  // Tell this player they answered and should wait
  send(player.ws, {
    type: "ANSWER_ACK",
    questionIndex,
    correct,
    points,
    yourScore: room.scores.get(player.userId) ?? 0,
  });

  // Notify others that this player has answered (no correct/score revealed yet)
  sendAllExcept(room, player.userId, {
    type: "OPPONENT_ANSWERED_Q",
    userId: player.userId,
    questionIndex,
  });

  // If all players have answered, resolve immediately
  const allAnswered = room.players.every(p => room.questionAnswers.get(p.userId) !== null);
  if (allAnswered) {
    if (room.questionTimer) clearTimeout(room.questionTimer);
    resolveQuestion(room);
  }
}

function endGame(room: ArenaRoom) {
  if (room.phase === "ended") return;
  room.phase = "ended";

  if (room.questionTimer) { clearTimeout(room.questionTimer); room.questionTimer = null; }

  let maxScore = 0;
  room.scores.forEach(s => { if (s > maxScore) maxScore = s; });
  const topPlayers = room.players.filter(p => (room.scores.get(p.userId) ?? 0) === maxScore);
  const winner = topPlayers.length === 1 ? topPlayers[0]!.userId : null;

  sendAll(room, {
    type: "GAME_END",
    scores: Object.fromEntries(room.scores),
    winner,
    correctAnswers: room.questions.map(q => ({ id: q.id, correctAnswer: q.correctAnswer })),
  });

  if (room.players.length === 2) {
    const [p1, p2] = room.players as [ArenaPlayer, ArenaPlayer];
    const s1 = room.scores.get(p1.userId) ?? 0;
    const s2 = room.scores.get(p2.userId) ?? 0;
    persistGameResult(p1.userId, p2.userId, s1, s2, winner, room.isFriendsRoom).catch(err =>
      logger.error({ err }, "Failed to persist arena game result"),
    );
  } else {
    persistMultiGameResult(room, winner).catch(err =>
      logger.error({ err }, "Failed to persist multi-player arena game result"),
    );
  }

  rooms.delete(room.id);
  if (room.code) friendRoomsByCode.delete(room.code);
  room.players.forEach(p => playerToRoom.delete(p.userId));
}

// ─── Persist ──────────────────────────────────────────────────────────────────

async function persistGameResult(
  userId1: string, userId2: string,
  score1: number, score2: number,
  winner: string | null,
  isFriendsRoom: boolean,
) {
  const isDraw = winner === null;
  const upsert = async (userId: string, score: number, isWinner: boolean) => {
    if (userId.startsWith("guest_")) return;
    return db.insert(arenaStatsTable).values({
      userId, wins: isWinner ? 1 : 0,
      losses: !isWinner && !isDraw ? 1 : 0,
      draws: isDraw ? 1 : 0,
      totalGames: 1, totalScore: score,
    }).onConflictDoUpdate({
      target: arenaStatsTable.userId,
      set: {
        wins: sql`${arenaStatsTable.wins} + ${isWinner ? 1 : 0}`,
        losses: sql`${arenaStatsTable.losses} + ${!isWinner && !isDraw ? 1 : 0}`,
        draws: sql`${arenaStatsTable.draws} + ${isDraw ? 1 : 0}`,
        totalGames: sql`${arenaStatsTable.totalGames} + 1`,
        totalScore: sql`${arenaStatsTable.totalScore} + ${score}`,
      },
    });
  };
  await Promise.all([upsert(userId1, score1, winner === userId1), upsert(userId2, score2, winner === userId2)]);

  // Coins/score/XP economy applies only to random-matchmaking games — friends-room
  // matches (any size, including a friend-created 1v1) are coin-neutral by design.
  if (!isFriendsRoom && !isDraw && winner) {
    const loserId = winner === userId1 ? userId2 : userId1;
    const rates = await getRatesForMode("arena");
    const promises: Promise<unknown>[] = [];

    if (!winner.startsWith("guest_")) {
      promises.push(
        db.update(profilesTable).set({
          coins: sql`${profilesTable.coins} + ${rates.coinsPerWin}`,
          totalScore: sql`${profilesTable.totalScore} + ${rates.scorePerWin}`,
        }).where(eq(profilesTable.userId, winner)),
      );
      promises.push(awardBattlePassXp(winner, rates.xpPerWin).catch(() => {}));
    }
    if (!loserId.startsWith("guest_")) {
      promises.push(
        db.update(profilesTable).set({
          coins: sql`GREATEST(0, ${profilesTable.coins} - ${rates.coinsLostPerLoss})`,
        }).where(eq(profilesTable.userId, loserId)),
      );
    }
    await Promise.all(promises);
  }

  // Check arena badges after stats are persisted
  if (winner && !winner.startsWith("guest_")) {
    checkAndAwardBadges(winner, { arenaWin: true }).catch(() => {});
  }
}

async function persistMultiGameResult(room: ArenaRoom, winner: string | null) {
  const isDraw = winner === null;
  await Promise.all(room.players.map(p => {
    if (p.userId.startsWith("guest_")) return Promise.resolve();
    const score = room.scores.get(p.userId) ?? 0;
    const isWinner = winner === p.userId;
    return db.insert(arenaStatsTable).values({
      userId: p.userId, wins: isWinner ? 1 : 0,
      losses: !isWinner && !isDraw ? 1 : 0,
      draws: isDraw ? 1 : 0,
      totalGames: 1, totalScore: score,
    }).onConflictDoUpdate({
      target: arenaStatsTable.userId,
      set: {
        wins: sql`${arenaStatsTable.wins} + ${isWinner ? 1 : 0}`,
        losses: sql`${arenaStatsTable.losses} + ${!isWinner && !isDraw ? 1 : 0}`,
        draws: sql`${arenaStatsTable.draws} + ${isDraw ? 1 : 0}`,
        totalGames: sql`${arenaStatsTable.totalGames} + 1`,
        totalScore: sql`${arenaStatsTable.totalScore} + ${score}`,
      },
    });
  }));
  // Check arena badges after stats are persisted
  if (winner && !winner.startsWith("guest_")) {
    checkAndAwardBadges(winner, { arenaWin: true }).catch(() => {});
  }
}

// ─── WebSocket handler ────────────────────────────────────────────────────────

function handleMessage(player: ArenaPlayer, raw: string) {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }
  const { type } = msg;

  if (type === "JOIN_QUEUE") {
    if (playerToRoom.has(player.userId)) return;
    if (queue.some(p => p.userId === player.userId)) return;
    queue.push(player);
    send(player.ws, { type: "QUEUE_JOINED", position: queue.length });
    tryMatch();
    return;
  }

  if (type === "CREATE_ROOM") {
    if (playerToRoom.has(player.userId)) return;
    const qc = typeof msg.questionCount === "number" ? msg.questionCount : 12;
    createFriendsRoom(player, qc);
    return;
  }

  if (type === "JOIN_ROOM") {
    if (playerToRoom.has(player.userId)) return;
    joinFriendsRoom(player, (msg.code ?? "").toString().toUpperCase());
    return;
  }

  if (type === "PLAYER_READY") {
    const room = rooms.get(playerToRoom.get(player.userId) ?? "");
    if (!room || room.phase !== "lobby") return;
    room.readyPlayers.add(player.userId);
    sendAll(room, lobbyPayload(room));
    if (room.readyPlayers.size === room.players.length && room.players.length >= 2) {
      startCategorySelection(room).catch(err => {
        logger.error({ err }, "Failed to start category selection");
        sendAll(room, { type: "ERROR", message: "Failed to start game" });
      });
    }
    return;
  }

  if (type === "PLAYER_UNREADY") {
    const room = rooms.get(playerToRoom.get(player.userId) ?? "");
    if (!room || room.phase !== "lobby") return;
    room.readyPlayers.delete(player.userId);
    sendAll(room, lobbyPayload(room));
    return;
  }

  if (type === "SELECT_CATEGORIES") {
    const { categoryIds } = msg as { categoryIds: string[] };
    if (!Array.isArray(categoryIds) || categoryIds.length !== 3) {
      send(player.ws, { type: "ERROR", message: "Select exactly 3 categories." });
      return;
    }
    const room = rooms.get(playerToRoom.get(player.userId) ?? "");
    if (!room || room.phase !== "category_selection") return;

    room.categoriesSelected.set(player.userId, categoryIds);
    sendAll(room, {
      type: "CATEGORIES_PROGRESS",
      selected: room.categoriesSelected.size,
      total: room.players.length,
      // Only players who have confirmed their picks appear here
      picks: Object.fromEntries(room.categoriesSelected),
    });

    if (room.categoriesSelected.size === room.players.length) {
      room.phase = "game_loading";
      startGame(room).catch(err => {
        logger.error({ err }, "Failed to start arena game");
        sendAll(room, { type: "ERROR", message: "Failed to start game" });
      });
    }
    return;
  }

  if (type === "ANSWER") {
    const room = rooms.get(playerToRoom.get(player.userId) ?? "");
    if (!room) return;
    handleAnswer(room, player, msg.questionIndex, msg.selectedAnswer, msg.answerData);
    return;
  }

  if (type === "USE_POWER_UP") {
    const room = rooms.get(playerToRoom.get(player.userId) ?? "");
    if (!room || room.phase !== "game") return;
    handlePowerUp(room, player, msg).catch(err => logger.error({ err }, "Power-up error"));
    return;
  }

  if (type === "LEAVE") {
    handleDisconnect(player);
  }
}

async function consumeInventoryItem(userId: string, itemId: string): Promise<boolean> {
  const [entry] = await db.select().from(userInventoryTable)
    .where(and(eq(userInventoryTable.userId, userId), eq(userInventoryTable.itemId, itemId)));
  if (!entry || entry.quantity < 1) return false;

  if (entry.quantity === 1) {
    const [deleted] = await db.delete(userInventoryTable)
      .where(and(
        eq(userInventoryTable.id, entry.id),
        eq(userInventoryTable.quantity, 1)
      ))
      .returning();
    return !!deleted;
  } else {
    const [updated] = await db.update(userInventoryTable)
      .set({ quantity: entry.quantity - 1 })
      .where(and(
        eq(userInventoryTable.id, entry.id),
        eq(userInventoryTable.quantity, entry.quantity)
      ))
      .returning();
    return !!updated;
  }
}

async function handlePowerUp(room: ArenaRoom, player: ArenaPlayer, msg: any) {
  const { effect, itemId, questionId, targetUserId } = msg;

  // Verify the item database record
  try {
    const [item] = await db
      .select()
      .from(marketplaceItemsTable)
      .where(eq(marketplaceItemsTable.id, itemId));

    if (!rooms.has(room.id)) return;

    if (!item) {
      send(player.ws, { type: "ERROR", message: "Power-up item not found." });
      return;
    }

    if (item.type !== "powerup") {
      send(player.ws, { type: "ERROR", message: "Item is not a power-up." });
      return;
    }

    if (item.effect !== effect) {
      send(player.ws, { type: "ERROR", message: "Power-up effect mismatch." });
      return;
    }
  } catch (err) {
    logger.error({ err }, "Database error while validating power-up item");
    if (rooms.has(room.id)) {
      send(player.ws, { type: "ERROR", message: "Server error validating power-up." });
    }
    return;
  }

  // fifty_fifty: return 2 wrong option indices for the current question
  if (effect === "fifty_fifty") {
    if (room.questionAnswers.get(player.userId) !== null) {
      send(player.ws, { type: "ERROR", message: "You have already answered this question." });
      return;
    }

    // Find question by id in room questions
    const q = room.questions.find(q => q.id === questionId) ?? room.questions[room.currentQuestionIndex];
    if (!q) { send(player.ws, { type: "POWER_UP_RESULT", effect: "fifty_fifty", eliminatedOptions: [] }); return; }

    if (q.questionType === "matching" || q.questionType === "ordering" || q.questionType === "hotspot") {
      send(player.ws, { type: "ERROR", message: "This power-up isn't available for this question type." });
      return;
    }

    const consumed = await consumeInventoryItem(player.userId, itemId);
    if (!rooms.has(room.id)) return;
    if (!consumed) { send(player.ws, { type: "ERROR", message: "Power-up not in inventory" }); return; }

    const wrongIndices = q.options.map((_, i) => i).filter(i => i !== q.correctAnswer);
    const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
    const eliminatedOptions = shuffled.slice(0, 2).sort((a, b) => a - b);

    send(player.ws, { type: "POWER_UP_RESULT", effect: "fifty_fifty", eliminatedOptions });
    return;
  }

  // shield: protect this player from the next steal
  if (effect === "shield") {
    if (room.shields.get(player.userId)) {
      send(player.ws, { type: "ERROR", message: "Shield is already active." });
      return;
    }
    const consumed = await consumeInventoryItem(player.userId, itemId);
    if (!rooms.has(room.id)) return;
    if (!consumed) { send(player.ws, { type: "ERROR", message: "Power-up not in inventory" }); return; }

    room.shields.set(player.userId, true);
    send(player.ws, { type: "POWER_UP_RESULT", effect: "shield", active: true });
    return;
  }

  // steal_question: steal opponent's points for the current question
  if (effect === "steal_question") {
    if (targetUserId === player.userId) {
      send(player.ws, { type: "ERROR", message: "You cannot steal from yourself." });
      return;
    }

    if (room.stolenFrom.has(targetUserId)) {
      send(player.ws, { type: "POWER_UP_RESULT", effect: "steal_question", success: false, reason: "already_stolen" });
      return;
    }

    const target = room.players.find(p => p.userId === targetUserId);
    if (!target) { send(player.ws, { type: "POWER_UP_RESULT", effect: "steal_question", success: false, reason: "Target not found" }); return; }

    const targetAnswer = room.questionAnswers.get(target.userId);
    if (targetAnswer === null || targetAnswer === undefined) {
      send(player.ws, { type: "ERROR", message: "Target has not answered yet." });
      return;
    }

    const consumed = await consumeInventoryItem(player.userId, itemId);
    if (!rooms.has(room.id)) return;
    if (!consumed) { send(player.ws, { type: "ERROR", message: "Power-up not in inventory" }); return; }

    // Check if target has shield
    if (room.shields.get(target.userId)) {
      room.shields.set(target.userId, false);
      send(player.ws, { type: "POWER_UP_RESULT", effect: "steal_question", success: false, reason: "blocked" });
      send(target.ws, { type: "SHIELD_TRIGGERED", fromUsername: player.username });
      return;
    }

    // Check if target answered correctly this question
    if (!targetAnswer || !targetAnswer.correct || targetAnswer.points <= 0) {
      send(player.ws, { type: "POWER_UP_RESULT", effect: "steal_question", success: false, reason: "no_points" });
      return;
    }

    // Steal the points (give to stealer, don't remove from target — too punishing)
    const stolenPoints = targetAnswer.points;
    const newScore = (room.scores.get(player.userId) ?? 0) + stolenPoints;
    room.scores.set(player.userId, newScore);
    room.stolenFrom.add(target.userId);

    send(player.ws, { type: "POWER_UP_RESULT", effect: "steal_question", success: true, pointsStolen: stolenPoints, targetUsername: target.username, newScore });
    send(target.ws, { type: "POWER_UP_RECEIVED", effect: "steal_question", fromUsername: player.username, pointsStolen: stolenPoints });
    return;
  }
}

function handleDisconnect(player: ArenaPlayer) {
  const currentActive = activePlayers.get(player.userId);
  if (currentActive && currentActive.ws === player.ws) {
    activePlayers.delete(player.userId);
  }

  removeFromQueue(player.ws);

  const roomId = playerToRoom.get(player.userId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.phase === "lobby") {
    room.players = room.players.filter(p => p.userId !== player.userId);
    room.readyPlayers.delete(player.userId);
    playerToRoom.delete(player.userId);
    if (room.players.length === 0) {
      if (room.code) friendRoomsByCode.delete(room.code);
      rooms.delete(roomId);
    } else {
      sendAll(room, lobbyPayload(room));
    }
  } else if (room.phase !== "ended") {
    if (room.players.length <= 2) {
      if (room.questionTimer) { clearTimeout(room.questionTimer); room.questionTimer = null; }
      
      // Rage-quit protection/forfeits: if in game phase, record results
      if (room.phase === "game") {
        const remainingPlayer = room.players.find(p => p.userId !== player.userId);
        if (remainingPlayer) {
          const s1 = room.scores.get(remainingPlayer.userId) ?? 0;
          const s2 = room.scores.get(player.userId) ?? 0;
          persistGameResult(remainingPlayer.userId, player.userId, s1, s2, remainingPlayer.userId, room.isFriendsRoom).catch(err =>
            logger.error({ err }, "Failed to persist arena game result on disconnect")
          );
        }
      }

      sendAllExcept(room, player.userId, { type: "OPPONENT_LEFT", userId: player.userId, username: player.username });
      if (room.code) friendRoomsByCode.delete(room.code);
      rooms.delete(roomId);
      room.players.forEach(p => playerToRoom.delete(p.userId));
    } else {
      // Remove player from room, keep game going
      // Rage-quit protection/forfeits: record loss immediately for the disconnecting player
      if (room.phase === "game" && !player.userId.startsWith("guest_")) {
        const playerScore = room.scores.get(player.userId) ?? 0;
        db.insert(arenaStatsTable).values({
          userId: player.userId,
          wins: 0,
          losses: 1,
          draws: 0,
          totalGames: 1,
          totalScore: playerScore,
        }).onConflictDoUpdate({
          target: arenaStatsTable.userId,
          set: {
            losses: sql`${arenaStatsTable.losses} + 1`,
            totalGames: sql`${arenaStatsTable.totalGames} + 1`,
            totalScore: sql`${arenaStatsTable.totalScore} + ${playerScore}`,
          }
        }).catch(err => logger.error({ err }, "Failed to record loss for disconnected player"));
      }

      room.players = room.players.filter(p => p.userId !== player.userId);
      playerToRoom.delete(player.userId);
      room.readyPlayers.delete(player.userId);
      room.scores.delete(player.userId);
      room.shields.delete(player.userId);
      room.questionAnswers.delete(player.userId);

      sendAll(room, { type: "PLAYER_LEFT", userId: player.userId, username: player.username });

      // If only 1 player remains in the room, they win by default and the room ends
      if (room.players.length === 1) {
        const remainingPlayer = room.players[0]!;
        if (room.questionTimer) { clearTimeout(room.questionTimer); room.questionTimer = null; }
        
        if (room.phase === "game") {
          persistMultiGameResult(room, remainingPlayer.userId).catch(err =>
            logger.error({ err }, "Failed to persist multi-player arena result on sole survivor")
          );
        }

        sendAll(room, { type: "OPPONENT_LEFT", userId: remainingPlayer.userId, username: remainingPlayer.username });
        if (room.code) friendRoomsByCode.delete(room.code);
        rooms.delete(roomId);
        playerToRoom.delete(remainingPlayer.userId);
        return;
      }

      // If all remaining players have answered, resolve the question
      const allAnswered = room.players.every(p => room.questionAnswers.get(p.userId) !== null);
      if (allAnswered && room.phase === "game") {
        if (room.questionTimer) { clearTimeout(room.questionTimer); room.questionTimer = null; }
        resolveQuestion(room);
      }
    }
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupArena(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/arena/ws" });

  wss.on("connection", (ws) => {
    let player: ArenaPlayer | null = null;

    ws.on("message", (data) => {
      const raw = data.toString();
      let msg: any;
      try { msg = JSON.parse(raw); } catch { return; }

      if (!player) {
        if (msg.type === "INIT") {
          (async () => {
            try {
              let userId = `guest_${uid()}`;
              let username = `Guest_${uid().slice(0, 4)}`;
              let profileImageUrl: string | null = null;

              if (msg.testUserId && process.env.NODE_ENV !== "production" && process.env.ENABLE_ARENA_TEST_BYPASS === "true") {
                userId = msg.testUserId;
                username = `Test_${userId.slice(0, 4)}`;
              } else if (msg.token) {
                const { data: { user }, error } = await supabase.auth.getUser(msg.token);
                if (error || !user) {
                  send(ws, { type: "ERROR", message: "Invalid session token." });
                  return;
                }
                userId = user.id;

                const [dbUser] = await db
                  .select({
                    username: profilesTable.username,
                    profileImageUrl: usersTable.profileImageUrl,
                  })
                  .from(profilesTable)
                  .leftJoin(usersTable, eq(profilesTable.userId, usersTable.id))
                  .where(eq(profilesTable.userId, userId));

                if (dbUser) {
                  username = dbUser.username || username;
                  profileImageUrl = dbUser.profileImageUrl || null;
                }
              }

              const existing = activePlayers.get(userId);
              if (existing && existing.ws !== ws) {
                existing.ws.close();
              }

              player = {
                ws,
                userId,
                username,
                profileImageUrl,
              };
              activePlayers.set(userId, player);
              send(ws, { type: "READY" });
            } catch (err) {
              logger.error({ err }, "Error during INIT");
              send(ws, { type: "ERROR", message: "Failed to initialize session" });
            }
          })();
        }
        return;
      }
      handleMessage(player, raw);
    });

    ws.on("close", () => { if (player) handleDisconnect(player); });
    ws.on("error", (err) => { logger.error({ err }, "Arena WebSocket error"); });
  });

  logger.info("Arena WebSocket server listening at /api/arena/ws");
}
