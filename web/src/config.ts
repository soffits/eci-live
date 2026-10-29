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

export const TOP_N = 20;
export const NEW_WITHIN_DAYS = 45;

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

// Colours are chosen to stay distinct from each other first, on-brand second.
const LABS: Record<string, Lab> = {
  OpenAI: { color: "#10A37F", logo: openai },
  Anthropic: { color: "#D97757", logo: anthropic },
  "Google DeepMind": { color: "#4285F4", logo: deepmind },
  Google: { color: "#4285F4", logo: google },
  xAI: { color: "#1F2937", dark: "#E5E7EB", logo: xai },
  "Meta AI": { color: "#A855F7", logo: meta },
  DeepSeek: { color: "#06B6D4", logo: deepseek },
  Alibaba: { color: "#F59E0B", logo: alibaba },
  "Mistral AI": { color: "#EF4444", logo: mistral },
  Moonshot: { color: "#6366F1", logo: moonshot },
  "Z.ai (Zhipu AI)": { color: "#EC4899", logo: zai },
  MiniMax: { color: "#F43F5E", logo: minimax },
  Microsoft: { color: "#0EA5E9", logo: microsoft },
  Nvidia: { color: "#76B900", logo: nvidia },
};

const OTHER: Lab = { color: "#94A3B8" };

export function labStyle(lab: string, dark: boolean): { color: string; logo?: string } {
  const entry = LABS[lab] ?? OTHER;
  return { color: (dark && entry.dark) || entry.color, logo: entry.logo };
}
