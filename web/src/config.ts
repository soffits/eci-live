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

// Colours are chosen to stay distinct from each other first, on-brand second. Dark
// variants are brighter so they stay vivid on a near-black surface.
const LABS: Record<string, Lab> = {
  OpenAI: { color: "#10A37F", dark: "#2EE6B4", logo: openai },
  Anthropic: { color: "#D97757", dark: "#FF8F66", logo: anthropic },
  "Google DeepMind": { color: "#4285F4", dark: "#6AA6FF", logo: deepmind },
  Google: { color: "#4285F4", dark: "#6AA6FF", logo: google },
  xAI: { color: "#1F2937", dark: "#E5E7EB", logo: xai },
  "Meta AI": { color: "#A855F7", dark: "#C58CFF", logo: meta },
  DeepSeek: { color: "#06B6D4", dark: "#2FE0F5", logo: deepseek },
  Alibaba: { color: "#F59E0B", dark: "#FFC53D", logo: alibaba },
  "Mistral AI": { color: "#EF4444", dark: "#FF7070", logo: mistral },
  Moonshot: { color: "#6366F1", dark: "#8F94FF", logo: moonshot },
  "Z.ai (Zhipu AI)": { color: "#EC4899", dark: "#FF6FBA", logo: zai },
  MiniMax: { color: "#F43F5E", dark: "#FF6B85", logo: minimax },
  Microsoft: { color: "#0EA5E9", dark: "#3CC4FF", logo: microsoft },
  Nvidia: { color: "#76B900", dark: "#9BE01F", logo: nvidia },
};

const OTHER: Lab = { color: "#94A3B8", dark: "#B4BFCE" };

export function labStyle(lab: string, dark: boolean): { color: string; logo?: string } {
  const entry = LABS[lab] ?? OTHER;
  return { color: (dark && entry.dark) || entry.color, logo: entry.logo };
}
