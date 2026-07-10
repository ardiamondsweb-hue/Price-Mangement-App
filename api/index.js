// Vercel serverless entry point
// Vercel looks for files in the /api directory and wraps them as serverless functions.
// We simply re-export the configured Express app from src/index.js.
import app from "../src/index.js";

export default app;
