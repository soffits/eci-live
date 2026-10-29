import { useComputedColorScheme } from "@mantine/core";
import { labStyle } from "../config";
import classes from "./LabLogo.module.css";

export function useLabColor(): (lab: string) => string {
  const dark = useComputedColorScheme("light") === "dark";
  return (lab) => labStyle(lab, dark).color;
}

/** The lab's monochrome logo tinted in its colour, or its initial as a fallback. */
export function LabLogo({ lab, size = 18 }: { lab: string; size?: number }) {
  const dark = useComputedColorScheme("light") === "dark";
  const { color, logo } = labStyle(lab, dark);
  if (!logo) {
    return (
      <span
        className={classes.initial}
        style={{ width: size, height: size, background: color, fontSize: size * 0.58 }}
        aria-hidden
      >
        {lab.charAt(0)}
      </span>
    );
  }
  return (
    <span
      className={classes.logo}
      style={{ width: size, height: size, background: color, maskImage: `url("${logo}")` }}
      aria-hidden
    />
  );
}
