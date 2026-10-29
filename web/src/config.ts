import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg";
import deepmind from "@lobehub/icons-static-svg/icons/deepmind.svg";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek.svg";
import google from "@lobehub/icons-static-svg/icons/google.svg";
import meta from "@lobehub/icons-static-svg/icons/meta.svg";
import microsoft from "@lobehub/icons-static-svg/icons/microsoft.svg";
import minimax from "@lobehub/icons-static-svg/icons/minimax.svg";
import mistral from "@lobehub/icons-static-svg/icons/mistral.svg";
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg";
import nvidia from "@lobehub/icons-static-svg/icons/nvidia.svg";
import openai from "@lobehub/icons-static-svg/icons/openai.svg";
import alibaba from "@lobehub/icons-static-svg/icons/qwen.svg";
import xai from "@lobehub/icons-static-svg/icons/xai.svg";
import zai from "@lobehub/icons-static-svg/icons/zai.svg";

import type { Weights } from "./data";

export const TOP_N = 20;
export const TABLE_PAGE_SIZE = 25;
/** A model is "new" if it was released at most this many days before the snapshot. */
export const NEW_WITHIN_DAYS = 30;

export const WEIGHTS: Record<
  Weights,
  { label: string; hint: string; color: string; variant: "light" | "default" }
> = {
  open: { label: "Open", hint: "Weights are downloadable", color: "teal", variant: "light" },
  closed: { label: "Closed", hint: "API, hosted or unreleased", color: "gray", variant: "default" },
  unknown: {
    label: "Limited / unknown",
    hint: "Limited access, or not recorded",
    color: "yellow",
    variant: "light",
  },
};

export const LINKS = {
  repo: "https://github.com/soffits/eci-live",
  epochEci: "https://epoch.ai/benchmarks/eci",
  epochData: "https://epoch.ai/benchmarks",
  eciPublic: "https://github.com/epoch-research/eci-public",
  paper: "https://arxiv.org/abs/2512.00193",
  ccBy: "https://creativecommons.org/licenses/by/4.0/",
};

interface Lab {
  /** Colour on light backgrounds; `dark` overrides it on dark ones. */
  color: string;
  dark?: string;
  logo?: string;
}

// Ten labs with the most models get a colour of their own; the rest share the grey
// fallback (keeping their logo). Colours differ in hue and lightness so no two read alike,
// stay strong enough on white, and have brighter dark-mode variants for a near-black surface.
const OTHER: Lab = { color: "#8C95A3", dark: "#8B93A1" };

const LABS: Record<string, Lab> = {
  OpenAI: { color: "#0F9D74", dark: "#34D8A8", logo: openai },
  Anthropic: { color: "#D4572A", dark: "#FF8A5C", logo: anthropic },
  "Google DeepMind": { color: "#2F6FE4", dark: "#6EA8FF", logo: deepmind },
  Google: { color: "#2F6FE4", dark: "#6EA8FF", logo: google },
  xAI: { color: "#334155", dark: "#E2E8F0", logo: xai },
  "Meta AI": { color: "#9B3FD9", dark: "#C98BFF", logo: meta },
  DeepSeek: { color: "#0B93B8", dark: "#3DD6F5", logo: deepseek },
  Alibaba: { color: "#C28400", dark: "#FFC93D", logo: alibaba },
  "Mistral AI": { color: "#D21F3C", dark: "#FF6B81", logo: mistral },
  Moonshot: { color: "#8A5A2B", dark: "#D9A066", logo: moonshot },
  "Z.ai (Zhipu AI)": { color: "#D63FA4", dark: "#FF7ACB", logo: zai },
  MiniMax: { ...OTHER, logo: minimax },
  Microsoft: { ...OTHER, logo: microsoft },
  Nvidia: { ...OTHER, logo: nvidia },
};

/** Whether the lab has its own colour rather than the shared grey fallback. */
export function hasLabColor(lab: string): boolean {
  const entry = LABS[lab];
  return entry !== undefined && entry.color !== OTHER.color;
}

export function labStyle(lab: string, dark: boolean): { color: string; logo?: string } {
  const entry = LABS[lab] ?? OTHER;
  return { color: (dark && entry.dark) || entry.color, logo: entry.logo };
}

/** Colour-by-country: the countries with several models, in Mantine palette colours. */
export const COUNTRY_COLORS: Record<string, string> = {
  "United States of America": "blue",
  China: "red",
  France: "violet",
  "United Arab Emirates": "yellow",
  "United Kingdom": "teal",
  Canada: "orange",
};

/** Colour-by-access, for charts (the badges keep WEIGHTS' quieter colours). */
export const ACCESS_COLORS: Record<Weights, string> = {
  open: "teal",
  closed: "indigo",
  unknown: "orange",
};
