// Cogherence as an independently-deployable hub service behind the cogweb router.
// Runs createHub with ONLY the cogherence descriptor, so this process hosts many
// concurrent cogherence matches on its own — and a redeploy of cogherence restarts
// only this service, leaving the router and the other games' live matches alone.
// The cogweb router (createRouter) fronts this and the sibling game hubs, aggregates
// their /api/games, and serves the unified portal lobby — the single way cogherence is
// hosted now (the old standalone single-room server is retired).
import { fileURLToPath } from "node:url";
import { createHub } from "@cogweb/core";
import type { GameDescriptor } from "@cogweb/core";
import { cogherenceDescriptor } from "./descriptor.js";

const clientDir = fileURLToPath(new URL("../dist", import.meta.url));
const hub = createHub({ descriptors: [{ ...cogherenceDescriptor, clientDir } as GameDescriptor], appName: "cogherence" });

const portFlagIdx = process.argv.indexOf("--port");
const portFlag = portFlagIdx >= 0 ? Number(process.argv[portFlagIdx + 1]) : NaN;
const port =
  Number.isFinite(portFlag) && portFlag > 0 ? portFlag : Number(process.env.COGHERENCE_PORT ?? 8804);

hub.listen(port, () => console.log(`cogherence hub on http://localhost:${port}`));

const shutdown = (): void => {
  hub.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
