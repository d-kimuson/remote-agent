import { envService } from "./env.ts";
import { startServer } from "./server.ts";

startServer({
  port: envService.getEnv("PORT"),
});
