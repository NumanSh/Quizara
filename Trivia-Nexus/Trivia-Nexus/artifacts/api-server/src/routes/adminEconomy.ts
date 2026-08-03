import { Router, type IRouter } from "express";
import { getAllRates, setRates, ECONOMY_DEFAULTS } from "../lib/economyConfig";

const router: IRouter = Router();

function requireAdmin(req: any, res: any): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden: Admin role required" });
    return false;
  }
  return true;
}

// GET /api/admin/economy — all modes and their current rates
router.get("/admin/economy", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rates = await getAllRates();
    res.json(rates);
  } catch (err) {
    req.log.error({ err }, "Failed to get economy rates");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/economy/:mode — update one or more metrics for a single mode
router.put("/admin/economy/:mode", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { mode } = req.params;
    const validMetrics = ECONOMY_DEFAULTS[mode];
    if (!validMetrics) {
      res.status(404).json({ error: `Unknown economy mode "${mode}"` });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, number> = {};
    for (const [metric, value] of Object.entries(body)) {
      if (!(metric in validMetrics)) {
        res.status(400).json({ error: `Unknown metric "${metric}" for mode "${mode}"` });
        return;
      }
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        res.status(400).json({ error: `"${metric}" must be a non-negative integer` });
        return;
      }
      updates[metric] = value;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid metrics provided" });
      return;
    }

    await setRates(mode, updates);
    res.json({ mode, updated: updates });
  } catch (err) {
    req.log.error({ err }, "Failed to update economy rates");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
