// Dev orchestrator: pick free ports for the API and web before starting either,
// then hand both ports to the child processes so the front end's proxy always
// targets the API's actual port. Starting at the defaults (4000 / 5173), each
// port is incremented until a free one is found.
import net from "node:net";
import { spawn } from "node:child_process";

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    // No host → binds dual-stack, so a listener on either IPv4 or IPv6 counts as taken.
    srv.listen(port);
  });
}

async function findFreePort(start) {
  let port = start;
  while (!(await isFree(port))) {
    console.log(`port ${port} is taken, trying ${port + 1}...`);
    port += 1;
  }
  return port;
}

const apiPort = await findFreePort(Number(process.env.API_PORT) || 4000);
const webPort = await findFreePort(Number(process.env.WEB_PORT) || 5173);

console.log(`\n  API  →  http://localhost:${apiPort}`);
console.log(`  Web  →  http://localhost:${webPort}\n`);

// Pass the chosen ports down. server.ts reads API_PORT; vite.config.ts reads
// both (WEB_PORT to bind, API_PORT to point its /api proxy at the right place).
const env = { ...process.env, API_PORT: String(apiPort), WEB_PORT: String(webPort) };

const command =
  `npx concurrently --names "api,web" --prefix-colors "cyan,magenta" ` +
  `"npm run dev --workspace=apps/api" "npm run dev --workspace=apps/web"`;

const child = spawn(command, { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
