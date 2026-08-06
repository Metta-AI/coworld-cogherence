// Shared art icon: renders one of the luminous neon-glass game icons from
// src/client/icons/transparent/ (alpha-keyed, so they sit on any dark surface).
// Imported through vite (inlined as data URIs) so the icons render under every
// serving shape — hub prefix, Observatory proxy, and the static replay bundle.
import React from "react";

import alignIcon from "./icons/transparent/align.png";
import coherenceIcon from "./icons/transparent/coherence.png";
import dealIcon from "./icons/transparent/deal.png";
import energyIcon from "./icons/transparent/energy.png";
import exploitIcon from "./icons/transparent/exploit.png";
import heartIcon from "./icons/transparent/heart.png";
import logoIcon from "./icons/transparent/logo.png";
import mineralCIcon from "./icons/transparent/mineral-c.png";
import mineralGeIcon from "./icons/transparent/mineral-ge.png";
import mineralOIcon from "./icons/transparent/mineral-o.png";
import mineralSIcon from "./icons/transparent/mineral-s.png";

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

export const iconSrc: Record<IconName, string> = {
  "mineral-c": mineralCIcon,
  "mineral-o": mineralOIcon,
  "mineral-ge": mineralGeIcon,
  "mineral-s": mineralSIcon,
  heart: heartIcon,
  energy: energyIcon,
  coherence: coherenceIcon,
  align: alignIcon,
  exploit: exploitIcon,
  deal: dealIcon,
  logo: logoIcon,
};

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
      src={iconSrc[name]}
      width={size}
      height={size}
      alt={title ?? name}
      draggable={false}
    />
  );
}
