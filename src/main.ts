import { envService } from "./server/env.ts";
import { startServer } from "./server/server.ts";

startServer({
  port: envService.getEnv("PORT"),
});
