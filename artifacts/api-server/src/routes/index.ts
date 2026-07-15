import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import meRouter from "./me";
import borrowersRouter from "./borrowers";
import loansRouter from "./loans";
import loanRequestsRouter from "./loan-requests";
import dashboardRouter from "./dashboard";
import emiLoansRouter from "./emi-loans";
import debugRouter from "./debug";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(meRouter);
router.use(borrowersRouter);
router.use(loansRouter);
router.use(loanRequestsRouter);
router.use(dashboardRouter);
router.use(emiLoansRouter);
router.use(debugRouter);

export default router;
