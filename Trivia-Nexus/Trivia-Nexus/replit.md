# Quizara

A full-stack trivia quiz platform where knowledge becomes sport. Supports English and Arabic (RTL) UI. Features competitive leaderboards, a marketplace, power-ups, and a full admin panel.

## Architecture

pnpm monorepo with TypeScript. Contract-first API design (OpenAPI → Orval codegen).

### Artifacts

| Artifact | Path | Description |
|---|---|---|
| `artifacts/quizara` | `/` (port 20302) | React + Vite frontend (slug: `quizara`) |
| `artifacts/api-server` | `/api` (port 8080) | Express 5 backend |
| `artifacts/mockup-sandbox` | `/__mockup` (port 8081) | Component preview server (design tool) |

### Libraries

| Package | Description |
|---|---|
| `lib/api-spec` | OpenAPI spec + Orval codegen config |
| `lib/api-client-react` | Generated React Query hooks (`@workspace/api-client-react`) |
| `lib/api-zod` | Generated Zod schemas (`@workspace/api-zod`) |
| `lib/db` | Drizzle ORM schema + PostgreSQL client (`@workspace/db`) |
| `lib/replit-auth-web` | `useAuth()` hook for Replit OIDC auth (`@workspace/replit-auth-web`) |

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **Frontend**: React 18, Vite, TailwindCSS 4, Wouter (routing), React Query
- **Backend**: Express 5, Pino (logging)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (OpenAPI → React Query hooks + Zod schemas)
- **Auth**: Replit OIDC (openid-client)
- **Build**: esbuild

## Key Commands

```bash
pnpm run typecheck                              # Full typecheck
pnpm --filter @workspace/api-spec run codegen  # Regenerate hooks/schemas from OpenAPI
pnpm --filter @workspace/db run push           # Push DB schema (dev only)
```

## Database Schema

Tables: `sessions`, `users`, `profiles`, `categories`, `questions`, `quiz_sessions`, `level_progress`, `marketplace_items`, `user_inventory`, `settings`, `arena_stats`, `user_battle_pass`, `badges`, `user_badges`

### Hearts/Lives System
- `profiles.hearts` (integer, default 6, max 6) — current heart count
- `profiles.hearts_last_updated` (timestamptz) — timestamp used to compute refill timing
- Refill rate: 1 heart every 7 minutes; timer pauses when hearts = 6
- Deduction: 1 heart removed when a solo level is **failed** (score < 30)
- Guest users: hearts tracked in `localStorage` key `quizara_hearts`
- API: `GET /api/hearts`, `POST /api/hearts/deduct`

Key notes:
- `categories` is self-referential (parentId → main category / subcategory)
- `questions.options` and `questions.optionsAr` are JSON arrays (4 items)
- `questions.correctAnswer` is a 0-based index into the options array
- `quiz_sessions` stores the current question and score state

## API Routes

All routes under `/api`:

| Group | Prefix | Auth |
|---|---|---|
| Auth (Replit OIDC) | `/api/auth` | — |
| Categories | `/api/categories` | Optional |
| Quiz | `/api/quiz` | Optional (score only saved if authed) |
| Leaderboard | `/api/leaderboard` | Optional |
| Profile | `/api/profile` | Required |
| Admin | `/api/admin` | Required (role=admin) |

## Frontend Pages

| Route | Component | Description |
|---|---|---|
| `/` | `Home.tsx` | Hero, featured categories, CTA |
| `/categories` | `Categories.tsx` | World selector — each root category is a "world" |
| `/worlds/:categoryId` | `WorldMap.tsx` | Level map for a world — zigzag path of level nodes |
| `/quiz/:sessionId` | `Quiz.tsx` | Active quiz (timer, 4 choices, feedback); level mode via `?levelNum=N&worldId=X` |
| `/results/:sessionId` | `Results.tsx` | Final score, accuracy, grade |
| `/leaderboard` | `Leaderboard.tsx` | Global (all-time/weekly) + by country tabs |
| `/profile` | `Profile.tsx` | Stats, username/country editor, admin code, Trophy Cabinet (badges) |
| `/admin` | `Admin.tsx` | Admin panel (overview, categories, questions, users, settings, badges CRUD) |
| `/login` | `Login.tsx` | Branded sign-in page |

## Design System

- Dark mode only (`#0d1117` background, `#161b22` cards)
- Primary: Cyan (`hsl(188 86% 53%)`)
- Secondary: Indigo (`hsl(239 84% 67%)`)
- Font: Inter

## Auth

- Replit OIDC via `openid-client`
- Session stored in PostgreSQL (`sessions` table, express-session)
- `useAuth()` from `@workspace/replit-auth-web` — returns `{ user, isAuthenticated, login, logout }`
- Admin access: users enter code `QUIZARA_ADMIN_2024` in their profile to gain admin role

## Question Types

4 types supported in admin panel and backend:
- `multiple_choice` — 4 options, one correct (default)
- `true_false` — options auto-set to ["True", "False"]
- `image` — imageUrl field shown above question
- `fill_blank` — single correct answer in options[0]

DB columns: `questions.questionType` (varchar, default 'multiple_choice'), `questions.imageUrl` (text, nullable)

## Cosmetic Avatars & Profile Themes

- DB: `profiles.activeAvatarFrame`, `profiles.activeProfileBg`, `profiles.activeUsernameColor` (varchar 50, nullable) — store effect key directly
- `marketplaceItemsTable` extended: `type="cosmetic"` with 23 seeded items (8 frames, 8 bgs, 7 colors)
- Shared lib: `artifacts/quizara/src/lib/cosmetics.ts` — `FRAME_DEFS`, `BG_DEFS`, `COLOR_DEFS` with CSS style generators
- Routes: `POST /api/marketplace/equip` — sets active cosmetic by effect prefix (frame_/bg_/color_); cosmetics NOT consumed on equip
- Profile GET/PUT returns `activeAvatarFrame`, `activeProfileBg`, `activeUsernameColor` fields
- Marketplace: 5 tabs — Avatar Frames / Backgrounds / Name Colors / Power-Ups / Inventory; live preview of each cosmetic; Buy → Equip/Unequip flow
- Profile: frame applied via box-shadow+border on avatar circle; bg as gradient overlay on page container; username color via inline style
- Admin: "Marketplace" tab in admin panel — CRUD for all items with type/effect/emoji/price/active toggle; routes: `GET/POST /api/admin/marketplace`, `PUT/DELETE /api/admin/marketplace/:id`
- **Avatar Frames** (8): Gold Crown 500🪙, Fire Ring 400🪙, Ice Crystal 400🪙, Diamond Aura 800🪙, Neon Glow 500🪙, Rainbow 1000🪙, Dark Void 600🪙, Royal Purple 700🪙
- **Profile Backgrounds** (8): Sunset/Ocean/Galaxy/Forest/Cyberpunk/Midnight/Aurora/Lava — 300-600🪙 each
- **Username Colors** (7): Gold/Cyan/Purple/Rose/Emerald/Orange (200🪙 each), Rainbow Text 600🪙

## Lucky Wheel / Spin to Win

- DB: `profiles.lastWheelDate` (varchar "YYYY-MM-DD"), `profiles.extraWheelSpins` (integer, default 0)
- Routes: `GET /api/wheel/status`, `POST /api/wheel/spin`, `POST /api/wheel/ad-spin`
- 8 weighted segments: 50 Coins (30%), 100 Coins (20%), 1 Heart (20%), 200 Coins (10%), 2 Hearts (10%), Power-Up (5%), +100 XP (4%), JACKPOT 500 coins (1%)
- Reward logic: coins → profile.coins, hearts → capped at 6, xp → userBattlePass.seasonXp, powerup → random marketplace item (or 75 coins fallback)
- 1 free spin per day; extra spins via ad watch (POST /api/wheel/ad-spin grants +1)
- Frontend: `/wheel` page with SVG animated spinning wheel, CSS cubic-bezier 4.5s transition, fixed top pointer/needle
- Sidebar nav item "Lucky Wheel" (Sparkles icon, highlighted)
- Shows spin result card with reward details; "Watch Ad for Extra Spin" via WatchAdModal when no spins left

## Challenge a Friend via Link

- `challenges` table: id (7-char code), categoryId, questionIds (fixed set), creatorId, creatorName, title, questionCount, createdAt
- `challenge_scores` table: id, challengeId, sessionId, userId, playerName, score, correctAnswers, totalQuestions, timeTaken, completedAt
- Routes: `POST /api/challenges`, `GET /api/challenges/:code`, `POST /api/challenges/:code/start`, `POST /api/challenges/:code/scores`
- Challenge page: `/challenge/:code` — shows challenge info, shareable link, name input, Play Now, live leaderboard
- Flow: Create on Categories page (🔗 Challenge button per card) → share link → friend opens `/challenge/:code` → enters name → plays same fixed questions → score auto-submitted to mini-leaderboard on Results page
- Scores are ranked by score desc, then completion time asc; duplicate session submissions are idempotent
- Categories page: each world card has a "🔗 Challenge" button that creates a challenge + navigates to challenge page (link also copied to clipboard)
- Results page: detects `challenge_ctx` in sessionStorage, auto-submits score after quiz completes, shows rank banner + "View Board" button

## Achievement Badges System

- `badges` table: id, name, description, imageUrl, icon, coinReward, triggerType, triggerValue, isActive, sortOrder
- `user_badges` table: userId → usersTable, badgeId → badgesTable, earnedAt, coinsClaimed
- Trigger types: `manual`, `first_arena_win`, `total_arena_wins`, `streak_days`, `speed_answer`, `perfect_quiz`, `games_played`, `total_score`
- Badge checker: `artifacts/api-server/src/routes/badgeChecker.ts` — called from quiz.ts (completion), streak.ts (checkin), arenaManager.ts (win + speed)
- Routes: `GET /api/badges`, `POST /api/badges/:id/claim`, plus admin CRUD at `/api/admin/badges`
- 10 default badges auto-seeded on first request: Newcomer, First Blood, Speed Demon, 7-Day Streak, Perfect Quiz, Century, Trivia Master, Arena Champion, 30-Day Streak, Veteran
- Profile page: Trophy Cabinet section shows all badges; earned=full color+claim button, unearned=grayed+locked
- Admin panel: Badges tab with full CRUD (create, edit, delete, toggle active)

## Battle Pass System

- `user_battle_pass` table: userId, seasonXp, currentTier, hasPremium, claimedFreeTiers[], claimedPremiumTiers[]
- XP awards: 5 per correct answer, 20 per quiz completion, 25 per streak check-in
- Route: `GET /api/battlepass`, `POST /api/battlepass/claim-tier`, `POST /api/battlepass/premium`, `POST /api/battlepass/watch-ad-xp`
- 30 tiers with free + premium rewards (coins, hearts, marketplace items)

## Seeded Data

- 8 main categories (Anime & Manga, Geography, Cinema & TV, Science & Technology, History, Sports, Pop Culture, General Knowledge)
- 23 subcategories across all main categories
- 12 sample questions (Attack on Titan, Football, Mixed, Countries & Flags)

## Important Hook Signatures (post-codegen)

After codegen, these mutations changed to pass context in the mutate payload:
- `useSubmitAnswer()` → `mutate({ sessionId, data: { questionId, selectedAnswer } })`
- `useCompleteQuiz()` → `mutate({ sessionId })`
- `useAdminListQuestions({ offset, limit }, opts)` — params use `offset` not `page`
- Leaderboard period enum: `"all_time"` | `"weekly"` (not `"all"`)
