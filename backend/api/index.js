import app from "../src/app.js";

// Vercel Node Function handler
export default function handler(req, res) {
  // Express app نفسه هو فانكشن middleware (req,res,next),
  // فممكن نستدعيه كده:
  return app(req, res);
}
