// Per-agent console entry. The coworld host serves this bundle on
// `/client/player?slot=&token=` (the agent view); which seat it follows comes
// from the URL the host opens (`/cog/:id` / `?seat=`), which <App/> reads via its
// own router. The socket is the same-origin feed — the server redacts each seat's
// CoghereView, so this view sees only what that seat may see. Mirrors `main.tsx`.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
