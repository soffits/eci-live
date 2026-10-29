import { Anchor, createTheme } from "@mantine/core";

const font = "'Geist Variable', ui-sans-serif, system-ui, sans-serif";

export const theme = createTheme({
  fontFamily: font,
  fontFamilyMonospace: "ui-monospace, 'SF Mono', Menlo, monospace",
  headings: { fontFamily: font, fontWeight: "800" },
  primaryColor: "violet",
  defaultRadius: "md",
  cursorType: "pointer",
  // Links take the size of the text around them.
  components: { Anchor: Anchor.extend({ defaultProps: { inherit: true } }) },
});
