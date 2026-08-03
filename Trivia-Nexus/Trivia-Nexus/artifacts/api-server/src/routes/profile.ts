import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, usersTable, settingsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";
import { getRankTitle } from "./xpHelper";
import { checkAdminCodeAttempt, recordFailedAdminCodeAttempt } from "../lib/adminCodeAttempts";

// Returns null if no admin code has ever been configured (DB setting or ADMIN_CODE env var) —
// self-promotion must fail closed in that case, never fall back to a guessable constant.
async function getAdminCode(): Promise<string | null> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "admin_code"));
    return row?.value ?? process.env.ADMIN_CODE ?? null;
  } catch {
    return process.env.ADMIN_CODE ?? null;
  }
}

const router: IRouter = Router();

router.get("/profile", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));

    if (!profile) {
      try {
        [profile] = await db
          .insert(profilesTable)
          .values({ userId })
          .onConflictDoUpdate({
            target: profilesTable.userId,
            set: { updatedAt: new Date() },
          })
          .returning();
      } catch (err) {
        // Fallback in case of parallel insert race
        const [existing] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
        profile = existing;
        if (!profile) throw err;
      }
    }

    const totalXp = profile.totalXp ?? 0;
    res.json({
      id: userId,
      email: user?.email ?? null,
      username: profile.username,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      country: profile.country,
      role: profile.role,
      totalScore: profile.totalScore,
      coins: profile.coins,
      gamesPlayed: profile.gamesPlayed,
      bestScore: profile.bestScore,
      totalXp,
      rankTitle: getRankTitle(totalXp),
      createdAt: profile.createdAt,
      activeAvatarFrame: profile.activeAvatarFrame ?? null,
      activeProfileBg: profile.activeProfileBg ?? null,
      activeUsernameColor: profile.activeUsernameColor ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/profile", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const userId = req.user.id;
    const parsed = UpdateProfileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const { username, country, adminCode } = parsed.data;

    let finalRole: string | undefined;

    if (adminCode) {
      const attempt = checkAdminCodeAttempt(userId);
      if (!attempt.allowed) {
        res.status(429).json({ error: "Too many admin code attempts, try again later", remainingMs: attempt.remainingMs });
        return;
      }

      const correctCode = await getAdminCode();
      if (!correctCode) {
        res.status(403).json({ error: "Admin promotion is not configured" });
        return;
      }

      if (adminCode === correctCode) {
        finalRole = "admin";
      } else {
        recordFailedAdminCodeAttempt(userId);
        res.status(403).json({ error: "Invalid admin code" });
        return;
      }
    }

    if (username !== undefined) {
      // Check if username is already taken by a DIFFERENT user
      const [existingWithUsername] = await db
        .select()
        .from(profilesTable)
        .where(and(eq(profilesTable.username, username), ne(profilesTable.userId, userId)));
      if (existingWithUsername) {
        res.status(409).json({ error: "Username is already taken" });
        return;
      }
    }

    const updateObj: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (username !== undefined) updateObj.username = username;
    if (country !== undefined) updateObj.country = country;
    if (finalRole !== undefined) updateObj.role = finalRole;

    let [profile] = await db
      .insert(profilesTable)
      .values({
        userId,
        username: username ?? null,
        country: country ?? null,
        role: finalRole ?? "player",
      })
      .onConflictDoUpdate({
        target: profilesTable.userId,
        set: updateObj,
      })
      .returning();

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const totalXp = profile.totalXp ?? 0;
    res.json({
      id: userId,
      email: user?.email ?? null,
      username: profile.username,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
      country: profile.country,
      role: profile.role,
      totalScore: profile.totalScore,
      coins: profile.coins,
      gamesPlayed: profile.gamesPlayed,
      bestScore: profile.bestScore,
      totalXp,
      rankTitle: getRankTitle(totalXp),
      createdAt: profile.createdAt,
      activeAvatarFrame: profile.activeAvatarFrame ?? null,
      activeProfileBg: profile.activeProfileBg ?? null,
      activeUsernameColor: profile.activeUsernameColor ?? null,
    });
  } catch (err: any) {
    if (
      err.code === "23505" ||
      err.constraint === "profiles_username_key" ||
      err.message?.includes("profiles_username_unique")
    ) {
      res.status(409).json({ error: "Username is already taken" });
      return;
    }
    req.log.error({ err }, "Failed to update profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
