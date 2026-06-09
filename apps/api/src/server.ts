import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { registerAudit } from "./audit.js";
import { registerNotifications } from "./notifications.js";

registerAudit();
registerNotifications();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);

// Port is chosen by scripts/dev.mjs (free-port scan) and passed via env;
// defaults to 4000 when the API is started on its own.
const PORT = Number(process.env.API_PORT) || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
