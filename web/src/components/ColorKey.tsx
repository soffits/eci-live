import { ColorSwatch, Group, Text } from "@mantine/core";
import type { KeyEntry } from "../colors";

/** Colour key for the country and access colourings. */
export function ColorKey({ entries }: { entries: KeyEntry[] }) {
  return (
    <Group gap="xs" className="chrome">
      {entries.map((e) => (
        <Group key={e.label} gap={6} wrap="nowrap" className="chrome" px={10} py={6}>
          <ColorSwatch color={e.color} size={12} withShadow={false} />
          <Text size="sm">{e.label}</Text>
        </Group>
      ))}
    </Group>
  );
}
