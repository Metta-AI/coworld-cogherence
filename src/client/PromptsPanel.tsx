// Live transparency: the latest prompt each Cog's model saw + the decision it
// made. The spectator's window into the LLM politics.
import React from "react";
import { cogName } from "./colors";
import type { ActPromptFrame } from "./net/feed";

export function PromptsPanel({ actPrompts }: { actPrompts: Record<string, ActPromptFrame[]> }): React.ReactElement {
  const ids = Object.keys(actPrompts).sort();
  return (
    <div className="prompts" data-testid="prompts">
      <h2>What each Cog saw</h2>
      {ids.length === 0 ? (
        <p className="prompts-empty">No model decisions yet.</p>
      ) : (
        ids.map((id) => {
          const latest = actPrompts[id]!.at(-1)!;
          const idx = Number(id.replace(/\D/g, "")) || 0;
          return (
            <details key={id} className="prompt-entry">
              <summary>
                {cogName(idx)} · turn {latest.turn}
              </summary>
              <pre>{latest.content}</pre>
            </details>
          );
        })
      )}
    </div>
  );
}
