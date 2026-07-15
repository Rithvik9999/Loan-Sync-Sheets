---
name: Express path-scoped router middleware
description: router.use(middleware) without a path prefix runs for ALL requests entering that router, not just routes defined in it — causing cross-router 403s.
---

# Express path-scoped router middleware

## The rule
Always use `router.use("/path-prefix", middleware)` instead of `router.use(middleware)` when the middleware should only guard routes in that router. Without a path, the middleware fires for every request that passes through the router — including requests destined for completely different routers mounted after it.

**Why:** In the routes/index.ts pattern (`router.use(borrowersRouter); router.use(loansRouter);`), all routers are mounted without path prefixes, so Express tries each router in order. `router.use(requireStaff)` in borrowersRouter matches every path and blocks borrower-role requests to `/loans`, `/emi-loans`, etc. with 403 — they never reach their intended router.

**How to apply:** Any time a sub-router uses `router.use(authMiddleware)` without a path, check whether it should be `router.use("/routerPath", authMiddleware)`. In this project: `borrowers.ts` and `dashboard.ts` use `/borrowers` and `/dashboard` respectively.

## Symptoms
- Borrower session gets `{"error":"Staff access required"}` on `/api/loans` (or any other endpoint)
- The affected router is mounted before the target router in routes/index.ts
- The affected router has `router.use(attachRole, requireStaff)` with no path
