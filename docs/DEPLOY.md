# Deploying cogherence

Cogherence deploys as a **Softmax Coworld** — the runbook is
[`docs/coworld/README.md`](coworld/README.md) (build → certify → upload).

The two earlier deployment paths are **retired** and lived in the Metta monorepo
era of this code:

- the standalone `cogherence.dbloom.in` single-server deploy
  (`npm run deploy:prod`, `dist-server/cli-serve.js`), and
- the `cogherence-hub` service behind the cogweb portal at `cogweb.dbloom.in`
  (`npm run deploy:hub`, `dist-server/serve-hub.js`).

Their full runbooks (EC2/SSM topology, Cloudflare tunnels, provisioning) are in
this file's git history and in the Metta repo's
`packages/cogweb/games/cogherence` history.
