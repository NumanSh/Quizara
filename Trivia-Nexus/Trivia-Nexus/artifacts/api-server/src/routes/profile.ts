import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { profilesTable, usersTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateProfileBody } from "@workspace/api-zod";
import { getRankTitle } from "./xpHelper";

const DEFAULT_ADMIN_CODE = "QUIZARA_ADMIN_2024";

async function getAdminCode(): Promise<string> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "admin_code"));
    return row?.value ?? DEFAULT_ADMIN_CODE;
  } catch {
    return DEFAULT_ADMIN_CODE;
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
      [profile] = await db.insert(profilesTable).values({ userId }).returning();
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
      const correctCode = await getAdminCode();
      if (adminCode === correctCode) {
        finalRole = "admin";
      } else {
        res.status(403).json({ error: "Invalid admin code" });
        return;
      }
    }

    let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId));
    if (!profile) {
      [profile] = await db.insert(profilesTable).values({
        userId,
        username,
        country,
        role: finalRole ?? "player",
      }).returning();
    } else {
      [profile] = await db.update(profilesTable).set({
        ...(username !== undefined ? { username } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(finalRole !== undefined ? { role: finalRole } : {}),
      }).where(eq(profilesTable.userId, userId)).returning();
    }

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
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
