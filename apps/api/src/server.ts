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

const PORT = 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
