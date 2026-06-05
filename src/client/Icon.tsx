// Shared art icon: renders one of the luminous neon-glass game icons from
// public/icons/transparent/ (alpha-keyed, so they sit on any dark surface).
// Resolved through BASE_URL so it works under the build's relative `./` base.
import React from "react";

export type IconName =
  | "mineral-c"
  | "mineral-o"
  | "mineral-ge"
  | "mineral-s"
  | "heart"
  | "energy"
  | "coherence"
  | "align"
  | "exploit"
  | "deal"
  | "logo";

const BASE = import.meta.env.BASE_URL;

export function Icon({
  name,
  size = 20,
  title,
}: {
  name: IconName;
  size?: number;
  title?: string;
}): React.ReactElement {
  return (
    <img
      className="icon"
      src={`${BASE}icons/transparent/${name}.png`}
      width={size}
      height={size}
      alt={title ?? name}
      title={title}
      draggable={false}
    />
  );
}
