import "dotenv/config";

if (process.env.NODE_ENV === "production" && process.env.ENABLE_ARENA_TEST_BYPASS === "true") {
  throw new Error("CRITICAL SECURITY VIOLATION: ENABLE_ARENA_TEST_BYPASS is set to true in production mode!");
}
import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupArena } from "./lib/arenaManager";
const port = Number(process.env.PORT || 8080);

const server = http.createServer(app);

setupArena(server);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
