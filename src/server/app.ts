import { Hono } from "hono";

import { routes } from "./routes";

export const honoApp = new Hono();
honoApp.route("/api", routes);

export type HonoAppType = typeof honoApp;
