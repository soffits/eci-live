import { Chip, ColorSwatch, Group, ScrollArea } from "@mantine/core";
import { hasLabColor } from "../config";
import { legendEntries } from "../legend";
import { useLabColor } from "./LabLogo";

interface Props {
  labs: string[];
  selected: string[];
  onToggle: (labs: string[]) => void;
  /** One scrolling row instead of wrapping, for phones. */
  scroll?: boolean;
}

/** Colour key for the lab colours, one chip per colour drawn; a chip toggles its labs in
 * the shared lab filter. */
export function LabLegend({ labs, selected, onToggle, scroll = false }: Props) {
  const colorOf = useLabColor();
  const chips = (
    <Group gap={6} wrap={scroll ? "nowrap" : "wrap"} pb={scroll ? 10 : 0}>
      {legendEntries(labs, colorOf, hasLabColor).map((entry) => (
        <Chip
          key={entry.color}
          size={scroll ? "sm" : "xs"}
          variant="outline"
          checked={entry.labs.every((lab) => selected.includes(lab))}
          onChange={() => onToggle(entry.labs)}
          color={entry.color}
          title={entry.labs.length > 1 ? entry.labs.join(", ") : undefined}
        >
          <Group component="span" gap={6} wrap="nowrap">
            <ColorSwatch component="span" color={entry.color} size={8} withShadow={false} />
            {entry.other ? `${entry.label} (${entry.labs.length})` : entry.label}
          </Group>
        </Chip>
      ))}
    </Group>
  );
  return scroll ? (
    <ScrollArea type="auto" scrollbarSize={6} offsetScrollbars="x">
      {chips}
    </ScrollArea>
  ) : (
    chips
  );
}
