import { Router, type IRouter, type Request, type Response } from "express";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

// Stubs for mobile auth if needed in the future, currently disabled
router.post("/mobile-auth/token-exchange", (req, res) => {
  res.status(501).json({ error: "Not implemented. Use Supabase SDK directly." });
});

router.post("/mobile-auth/logout", (req, res) => {
  res.json({ success: true });
});

export default router;
