import { type Request, type Response, type NextFunction } from "express";
import { supabase } from "../lib/supabase";
import { db, profilesTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role?: string;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Only log if it's an API route that might need auth
    if (!req.url.includes("/health") && !req.url.includes("/public")) {
      req.log.warn({ url: req.url, headers: req.headers }, "Auth header missing or invalid format");
    }
    next();
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    req.log.warn({ url: req.url }, "Bearer token missing after split");
    next();
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      req.log.warn({ error: error?.message, url: req.url }, "Supabase auth validation failed");
      next();
      return;
    }

    // Map Supabase user to App AuthUser
    const fullName = user.user_metadata?.full_name || "";
    const [firstName = "", ...lastNameParts] = fullName.split(" ");
    const lastName = lastNameParts.join(" ") || null;

    const authUser: AuthUser = {
      id: user.id,
      email: user.email ?? null,
      firstName: firstName || null,
      lastName: lastName,
      profileImageUrl: user.user_metadata?.avatar_url || null,
      role: "player", // Default fallback
    };

    req.user = authUser;

    // Auto-create/sync user and profile
    try {
      // 1. Fetch existing user and profile in a single fast query
      const [existing] = await db
        .select({
          userId: usersTable.id,
          email: usersTable.email,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          profileImageUrl: usersTable.profileImageUrl,
          profileId: profilesTable.userId,
          role: profilesTable.role,
          username: profilesTable.username,
        })
        .from(usersTable)
        .leftJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
        .where(eq(usersTable.id, user.id));

      const isNewUser = !existing;
      const isNewProfile = !existing || !existing.profileId;

      // 2. Handle potential ID change for the same email (Migration)
      // Only check this if the user ID is newly encountered (isNewUser) to keep hot path fast
      if (isNewUser && authUser.email) {
        const [emailUser] = await db.select().from(usersTable).where(eq(usersTable.email, authUser.email));
        
        if (emailUser && emailUser.id !== user.id) {
          req.log.info({ oldId: emailUser.id, newId: user.id, email: authUser.email }, "User ID changed for email, migrating data...");
          
          // 1. Temporarily change old user's email to avoid unique constraint
          await db.update(usersTable)
            .set({ email: `migrated_${emailUser.id}@temp.local`, updatedAt: new Date() })
            .where(eq(usersTable.id, emailUser.id));

          // 2. Insert the new user
          await db.insert(usersTable).values({
            id: user.id,
            email: authUser.email,
            firstName: authUser.firstName,
            lastName: authUser.lastName,
            profileImageUrl: authUser.profileImageUrl,
          });
          
          // 3. Migrate profile and other critical tables
          await db.update(profilesTable).set({ userId: user.id }).where(eq(profilesTable.userId, emailUser.id));
        }
      }

      // 3. Sync usersTable if it's new or if any fields changed
      const userNeedsUpdate = isNewUser || 
        existing.email !== authUser.email ||
        existing.firstName !== authUser.firstName ||
        existing.lastName !== authUser.lastName ||
        existing.profileImageUrl !== authUser.profileImageUrl;

      if (userNeedsUpdate) {
        await db
          .insert(usersTable)
          .values({
            id: user.id,
            email: authUser.email,
            firstName: authUser.firstName,
            lastName: authUser.lastName,
            profileImageUrl: authUser.profileImageUrl,
          })
          .onConflictDoUpdate({
            target: usersTable.id,
            set: {
              email: authUser.email,
              firstName: authUser.firstName,
              lastName: authUser.lastName,
              profileImageUrl: authUser.profileImageUrl,
              updatedAt: new Date(),
            },
          });
      }

      // 4. Sync profilesTable cleanly and race-free
      const newUsername = authUser.firstName ? `${authUser.firstName} ${authUser.lastName || ""}`.trim() : (user.email?.split("@")[0] || "Player");
      const defaultUsername = user.email?.split("@")[0] || "Player";

      if (isNewProfile) {
        // Upsert profile in case of concurrent requests
        const [profile] = await db
          .insert(profilesTable)
          .values({
            userId: user.id,
            username: newUsername,
            role: "player",
            coins: 0,
            totalScore: 0,
            totalXp: 0,
            gamesPlayed: 0,
            bestScore: 0,
            hearts: 6,
            heartsLastUpdated: new Date(),
          })
          .onConflictDoUpdate({
            target: profilesTable.userId,
            set: {
              updatedAt: new Date(),
              username: authUser.firstName 
                ? sql`CASE 
                    WHEN ${profilesTable.username} = 'Player' OR ${profilesTable.username} = ${defaultUsername} THEN ${newUsername}
                    ELSE ${profilesTable.username}
                  END`
                : profilesTable.username,
            }
          })
          .returning();
        
        authUser.role = profile?.role || "player";
      } else {
        authUser.role = existing.role || "player";
        
        // Only update profile username if it is currently "Player" or the default email-based username,
        // and we have a better/new username available
        const isDefault = existing.username === "Player" || existing.username === defaultUsername;
        if (isDefault && authUser.firstName) {
          await db
            .update(profilesTable)
            .set({
              username: newUsername,
              updatedAt: new Date(),
            })
            .where(eq(profilesTable.userId, user.id));
        }
      }
    } catch (dbErr) {
      console.error("Failed to sync profile to database:", dbErr);
    }

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    next();
  }
}
