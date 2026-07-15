// Vercel serverless entry point.
//
// Vercel's Node.js runtime calls the default export with (req, res),
// which is exactly the signature of an Express app instance — so we
// can hand it the same `app` used by the normal Replit/Node server
// (src/index.ts) without any extra wrapping.
import app from "../src/app.js";

export default app;
