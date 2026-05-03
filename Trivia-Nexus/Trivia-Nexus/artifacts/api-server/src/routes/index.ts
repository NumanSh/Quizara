import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import questionsRouter from "./questions";
import quizRouter from "./quiz";
import leaderboardRouter from "./leaderboard";
import profileRouter from "./profile";
import adminRouter from "./admin";
import marketplaceRouter from "./marketplace";
import worldsRouter from "./worlds";
import heartsRouter from "./hearts";
import streakRouter from "./streak";
import battlepassRouter from "./battlepass";
import badgesRouter from "./badges";
import challengesRouter from "./challenges";
import wheelRouter from "./wheel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(questionsRouter);
router.use(quizRouter);
router.use(worldsRouter);
router.use(heartsRouter);
router.use(streakRouter);
router.use(battlepassRouter);
router.use(badgesRouter);
router.use(challengesRouter);
router.use(wheelRouter);
router.use(leaderboardRouter);
router.use(profileRouter);
router.use(adminRouter);
router.use(marketplaceRouter);

export default router;
