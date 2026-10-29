// The single place where the look is defined: Mantine theme, component defaults and
// CSS variables. Components and CSS modules read `--mantine-*` and `--eci-*` variables
// from here instead of overriding library internals.
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Chip,
  type CSSVariablesResolver,
  createTheme,
  Drawer,
  MultiSelect,
  SegmentedControl,
  TextInput,
  Tooltip,
} from "@mantine/core";

const font = "'Geist Variable', ui-sans-serif, system-ui, sans-serif";

export const theme = createTheme({
  fontFamily: font,
  fontFamilyMonospace: "ui-monospace, 'SF Mono', Menlo, monospace",
  headings: { fontFamily: font, fontWeight: "800" },
  primaryColor: "violet",
  defaultRadius: "md",
  cursorType: "pointer",
  components: {
    // Links take the size of the text around them.
    Anchor: Anchor.extend({ defaultProps: { inherit: true } }),
    Badge: Badge.extend({ defaultProps: { radius: "xl" } }),
    Button: Button.extend({ defaultProps: { radius: "xl" } }),
    Chip: Chip.extend({ defaultProps: { radius: "xl" } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: "xl" } }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true } }),
    TextInput: TextInput.extend({ defaultProps: { radius: "xl" } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { radius: "xl" } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: "xl" } }),
    // `size="sheet"` resolves to --drawer-size-sheet below: a bottom sheet as tall as its content.
    Drawer: Drawer.extend({ defaultProps: { radius: "lg" } }),
  },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--drawer-size-sheet": "auto",
  },
  light: {
    "--mantine-color-body": "#f4f4f7",
    "--mantine-color-dimmed": "#5f6170",
    "--mantine-color-placeholder": "var(--mantine-color-gray-6)",
    "--eci-surface": "#ffffff",
    "--eci-hero-surface": "#ffffff",
    "--eci-page-dots": "rgb(15 23 42 / 7%)",
    "--eci-capsule-opacity": "0.4",
  },
  dark: {
    "--mantine-color-body": "#0a0b0e",
    "--mantine-color-dimmed": "#a9abb8",
    "--mantine-color-placeholder": "var(--mantine-color-dark-1)",
    "--eci-surface": "#121317",
    "--eci-hero-surface": "#15161b",
    "--eci-page-dots": "rgb(255 255 255 / 6%)",
    "--eci-capsule-opacity": "0.5",
  },
});
