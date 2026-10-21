// Developer page for the roll API: `yarn dev`, then open /dnd-dice/dev/api-test.html.
// Renders the self tray outside of Owlbear Rodeo and sends requests like dnd-sheet does.
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";

import "../src/fonts/fonts.css";
import { PluginThemeProvider } from "../src/plugin/PluginThemeProvider";
import { SelfTray } from "../src/plugin/SelfTray";
import { API_CHANNEL, ApiMessage, RequestedDice } from "../src/api/protocol";

const EXAMPLES: Record<string, RequestedDice> = {
  "d20 +5": { dice: ["D20"], bonus: 5 },
  "advantage +3": { dice: ["D20", "D20"], combination: "HIGHEST", bonus: 3 },
  "2d6+1d4+2": { dice: ["D6", "D6", "D4"], bonus: 2 },
  d100: { dice: [{ dice: ["D100", "D10"] }] },
  invalid: { dice: ["D7" as any] },
};

function Panel() {
  const [log, setLog] = useState<ApiMessage[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const channel = new BroadcastChannel(API_CHANNEL);
    channel.onmessage = (e) => setLog((l) => [e.data, ...l]);
    channelRef.current = channel;
    return () => channel.close();
  }, []);
  const send = (message: ApiMessage) => channelRef.current?.postMessage(message);
  return (
    <div style={{ padding: 16 }}>
      <button onClick={() => send({ type: "ping", id: crypto.randomUUID() })}>ping</button>
      {Object.entries(EXAMPLES).map(([name, roll]) => (
        <button key={name} onClick={() => send({ type: "roll", id: name, roll, style: "NEBULA" })}>
          {name}
        </button>
      ))}
      <pre id="log">{log.map((m) => JSON.stringify(m)).join("\n")}</pre>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PluginThemeProvider>
      <CssBaseline />
      <Panel />
      <div style={{ position: "fixed", right: 0, bottom: 0, width: 300, height: 320 }}>
        <SelfTray onToggle={() => {}} />
      </div>
    </PluginThemeProvider>
  </React.StrictMode>
);
