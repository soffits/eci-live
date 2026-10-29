// The single place where the look is defined: Mantine theme, component defaults and
// CSS variables. Components and CSS modules read `--mantine-*` and `--eci-*` variables
// from here instead of overriding library internals.
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Chip,
  Combobox,
  type CSSVariablesResolver,
  createTheme,
  Drawer,
  Input,
  Menu,
  MultiSelect,
  Pill,
  Progress,
  RangeSlider,
  SegmentedControl,
  Select,
  Spoiler,
  Switch,
  TextInput,
  Tooltip,
} from "@mantine/core";

const font = "'Geist Variable', ui-sans-serif, system-ui, sans-serif";

/** Marks interface chrome as not selectable; the rule lives in global.css. */
const chrome = "chrome";

// A raised surface with its own border: on the dark theme a shadow alone barely shows.
const FLOATING = {
  background: "var(--eci-floating)",
  borderColor: "var(--eci-floating-border)",
} as const;

export const DROPDOWN = { shadow: "lg", radius: "md", offset: 6 } as const;

export const theme = createTheme({
  fontFamily: font,
  fontFamilyMonospace: "ui-monospace, 'SF Mono', Menlo, monospace",
  headings: { fontFamily: font, fontWeight: "800" },
  primaryColor: "violet",
  defaultRadius: "md",
  cursorType: "pointer",
  components: {
    // Links take the size of the text around them.
    // Links are underlined, so small ones stand out from text by more than their colour.
    Anchor: Anchor.extend({ defaultProps: { inherit: true, underline: "always" } }),
    // One badge look everywhere: sentence case, a light fill and a matching hairline border.
    Badge: Badge.extend({
      defaultProps: { radius: "xl", variant: "light", tt: "none", fw: 600 },
      classNames: { root: chrome },
      styles: {
        root: { border: "1px solid color-mix(in srgb, currentColor 40%, transparent)" },
      },
    }),
    Button: Button.extend({ defaultProps: { radius: "xl" } }),
    Chip: Chip.extend({ defaultProps: { radius: "xl" } }),
    ActionIcon: ActionIcon.extend({ defaultProps: { radius: "xl" } }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true }, classNames: { tooltip: chrome } }),
    TextInput: TextInput.extend({ defaultProps: { radius: "xl" } }),
    // Dropdowns float above the cards they open over: a clear shadow keeps them apart.
    MultiSelect: MultiSelect.extend({ defaultProps: { radius: "xl", comboboxProps: DROPDOWN } }),
    Select: Select.extend({ defaultProps: { comboboxProps: DROPDOWN } }),
    Menu: Menu.extend({
      defaultProps: { shadow: "lg", radius: "md" },
      styles: { dropdown: FLOATING },
    }),
    Combobox: Combobox.extend({ styles: { dropdown: FLOATING } }),
    // The selected item is filled in the primary colour, readable on light and dark tracks.
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: "xl", color: "violet", withItemsBorders: false },
      classNames: { root: chrome },
    }),
    Switch: Switch.extend({ classNames: { root: chrome } }),
    Spoiler: Spoiler.extend({ classNames: { control: chrome } }),
    Pill: Pill.extend({ classNames: { root: chrome } }),
    // Typing and selecting inside a field still works: an editable element's
    // `user-select: auto` computes to `contain`. The field just stays out of page selections.
    Input: Input.extend({ classNames: { wrapper: chrome } }),
    Progress: Progress.extend({ classNames: { label: chrome } }),
    RangeSlider: RangeSlider.extend({ classNames: { label: chrome, markLabel: chrome } }),
    // `size="sheet"` resolves to --drawer-size-sheet below: a bottom sheet as tall as its content.
    Drawer: Drawer.extend({ defaultProps: { radius: "lg" } }),
  },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--drawer-size-sheet": "auto",
  },
  light: {
    "--mantine-color-body": "#f2f2f6",
    "--mantine-color-dimmed": "#4b4d5c",
    "--mantine-color-placeholder": "#6b6e7d",
    "--mantine-color-default-border": "#d4d5de",
    "--eci-surface": "#ffffff",
    "--eci-floating": "#ffffff",
    "--eci-floating-border": "#c4c6d2",
    "--eci-hero-surface": "#ffffff",
    "--eci-card-border": "#d4d5de",
    "--eci-page-dots": "rgb(15 23 42 / 7%)",
    "--eci-grid": "#e1e2ea",
    "--eci-axis": "#b9bbc8",
    "--eci-capsule-opacity": "0.32",
    "--eci-dot-ring": "#ffffff",
    "--eci-tie-band": "#f1effa",
    "--eci-tie-accent": "var(--mantine-color-violet-6)",
    "--eci-tie-text": "var(--mantine-color-violet-8)",
    "--eci-glow": "rgb(139 92 246 / 22%)",
  },
  dark: {
    "--mantine-color-body": "#0a0b0e",
    "--mantine-color-dimmed": "#bcbecb",
    "--mantine-color-placeholder": "#9a9cab",
    "--eci-surface": "#121317",
    "--eci-floating": "#1d1e25",
    "--eci-floating-border": "#3b3d48",
    "--eci-hero-surface": "#15161b",
    "--eci-card-border": "#2c2e36",
    "--eci-page-dots": "rgb(255 255 255 / 6%)",
    "--eci-grid": "#25272f",
    "--eci-axis": "#41434e",
    "--eci-capsule-opacity": "0.4",
    "--eci-dot-ring": "#f8fafc",
    "--eci-tie-band": "#1d1b2b",
    "--eci-tie-accent": "var(--mantine-color-violet-4)",
    "--eci-tie-text": "var(--mantine-color-violet-2)",
    "--eci-glow": "rgb(139 92 246 / 30%)",
  },
});
