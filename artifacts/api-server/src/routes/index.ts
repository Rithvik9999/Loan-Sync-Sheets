import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import borrowersRouter from "./borrowers";
import loansRouter from "./loans";
import repaymentsRouter from "./repayments";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(borrowersRouter);
router.use(loansRouter);
router.use(repaymentsRouter);
router.use(dashboardRouter);

export default router;
