import { pgTable, text, integer, timestamp, boolean, jsonb, varchar, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const profilesTable = pgTable("profiles", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  username: varchar("username", { length: 50 }).unique(),
  country: varchar("country", { length: 100 }),
  role: varchar("role", { length: 20 }).notNull().default("player"),
  totalScore: integer("total_score").notNull().default(0),
  coins: integer("coins").notNull().default(0),
  gamesPlayed: integer("games_played").notNull().default(0),
  bestScore: integer("best_score").notNull().default(0),
  hearts: integer("hearts").notNull().default(6),
  heartsLastUpdated: timestamp("hearts_last_updated", { withTimezone: true }).notNull().defaultNow(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastStreakDate: varchar("last_streak_date", { length: 10 }),
  lastCoinAdDate: varchar("last_coin_ad_date", { length: 10 }),
  coinAdWatchCount: integer("coin_ad_watch_count").notNull().default(0),
  lastWheelDate: varchar("last_wheel_date", { length: 10 }),
  extraWheelSpins: integer("extra_wheel_spins").notNull().default(0),
  activeAvatarFrame: varchar("active_avatar_frame", { length: 50 }),
  activeProfileBg: varchar("active_profile_bg", { length: 50 }),
  activeUsernameColor: varchar("active_username_color", { length: 50 }),
  totalXp: integer("total_xp").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const categoriesTable = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  color: varchar("color", { length: 30 }),
  imageUrl: text("image_url"),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionsTable = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull().references(() => categoriesTable.id, { onDelete: "cascade" }),
  questionType: varchar("question_type", { length: 30 }).notNull().default("multiple_choice"),
  question: text("question").notNull(),
  questionAr: text("question_ar").notNull(),
  imageUrl: text("image_url"),
  options: jsonb("options").$type<string[]>().notNull(),
  optionsAr: jsonb("options_ar").$type<string[]>().notNull(),
  correctAnswer: integer("correct_answer").notNull(),
  explanation: text("explanation"),
  explanationAr: text("explanation_ar"),
  difficulty: integer("difficulty").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizSessionsTable = pgTable("quiz_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  categoryId: varchar("category_id").notNull().references(() => categoriesTable.id),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  score: integer("score").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(10),
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  questionIds: jsonb("question_ids").$type<string[]>().notNull().default([]),
  levelNumber: integer("level_number"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const marketplaceItemsTable = pgTable("marketplace_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  description: text("description").notNull(),
  descriptionAr: text("description_ar").notNull(),
  type: varchar("type", { length: 30 }).notNull(), // powerup, skin, subscription
  effect: varchar("effect", { length: 50 }).notNull(), // fifty_fifty, freeze_timer, extra_time, skip_question, double_score, lucky_wheel
  emoji: varchar("emoji", { length: 10 }).notNull().default("⚡"),
  price: integer("price").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userInventoryTable = pgTable("user_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  itemId: varchar("item_id").notNull().references(() => marketplaceItemsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Profile = typeof profilesTable.$inferSelect;
export type InsertProfile = typeof profilesTable.$inferInsert;
export type Category = typeof categoriesTable.$inferSelect;
export type InsertCategory = typeof categoriesTable.$inferInsert;
export type Question = typeof questionsTable.$inferSelect;
export type InsertQuestion = typeof questionsTable.$inferInsert;
export type QuizSession = typeof quizSessionsTable.$inferSelect;
export type InsertQuizSession = typeof quizSessionsTable.$inferInsert;
export const settingsTable = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const levelProgressTable = pgTable("level_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").notNull().references(() => categoriesTable.id, { onDelete: "cascade" }),
  levelNumber: integer("level_number").notNull(),
  completed: boolean("completed").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lp_user_cat_level_idx").on(table.userId, table.categoryId, table.levelNumber),
]);

export const arenaStatsTable = pgTable("arena_stats", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  totalGames: integer("total_games").notNull().default(0),
  totalScore: integer("total_score").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const userBattlePassTable = pgTable("user_battle_pass", {
  userId: varchar("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  seasonXp: integer("season_xp").notNull().default(0),
  isPremium: boolean("is_premium").notNull().default(false),
  claimedFreeTiers: jsonb("claimed_free_tiers").$type<number[]>().notNull().default([]),
  claimedPremiumTiers: jsonb("claimed_premium_tiers").$type<number[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const challengesTable = pgTable("challenges", {
  id: varchar("id", { length: 10 }).primaryKey(),
  categoryId: varchar("category_id").notNull().references(() => categoriesTable.id),
  questionIds: jsonb("question_ids").$type<string[]>().notNull(),
  creatorId: varchar("creator_id").references(() => usersTable.id, { onDelete: "set null" }),
  creatorName: varchar("creator_name", { length: 100 }),
  title: varchar("title", { length: 200 }),
  questionCount: integer("question_count").notNull().default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challengeScoresTable = pgTable("challenge_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id", { length: 10 }).notNull().references(() => challengesTable.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id").references(() => quizSessionsTable.id),
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  playerName: varchar("player_name", { length: 100 }).notNull(),
  score: integer("score").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  timeTaken: integer("time_taken").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const badgesTable = pgTable("badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  icon: varchar("icon", { length: 10 }).notNull().default("🏆"),
  coinReward: integer("coin_reward").notNull().default(0),
  triggerType: varchar("trigger_type", { length: 50 }).notNull(),
  triggerValue: integer("trigger_value"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userBadgesTable = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  badgeId: varchar("badge_id").notNull().references(() => badgesTable.id, { onDelete: "cascade" }),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  coinsClaimed: boolean("coins_claimed").notNull().default(false),
});

export type MarketplaceItem = typeof marketplaceItemsTable.$inferSelect;
export type UserInventory = typeof userInventoryTable.$inferSelect;
export type Setting = typeof settingsTable.$inferSelect;
export type ArenaStats = typeof arenaStatsTable.$inferSelect;
export type LevelProgress = typeof levelProgressTable.$inferSelect;
export type UserBattlePass = typeof userBattlePassTable.$inferSelect;
export type Badge = typeof badgesTable.$inferSelect;
export type UserBadge = typeof userBadgesTable.$inferSelect;
