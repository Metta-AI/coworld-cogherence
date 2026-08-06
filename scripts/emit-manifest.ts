// Print cogherence's Coworld manifest template to stdout. The owning project
// stores the generated JSON beside its compose file for `coworld build`.
import { buildCogherenceManifest } from "../src/game/coworld.js";

console.log(JSON.stringify(buildCogherenceManifest(), null, 2));
