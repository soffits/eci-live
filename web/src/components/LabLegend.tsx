import { Chip, ColorSwatch, Group } from "@mantine/core";
import { hasLabColor } from "../config";
import { legendEntries } from "../legend";
import { useLabColor } from "./LabLogo";

interface Props {
  labs: string[];
  selected: string[];
  onToggle: (labs: string[]) => void;
}

/** Colour key for the lab colours, one chip per colour drawn; a chip toggles its labs in
 * the shared lab filter. */
export function LabLegend({ labs, selected, onToggle }: Props) {
  const colorOf = useLabColor();
  return (
    <Group gap={6}>
      {legendEntries(labs, colorOf, hasLabColor).map((entry) => (
        <Chip
          key={entry.color}
          size="xs"
          variant="outline"
          checked={entry.labs.every((lab) => selected.includes(lab))}
          onChange={() => onToggle(entry.labs)}
          color={entry.color}
          title={entry.other ? entry.labs.join(", ") : undefined}
        >
          <Group component="span" gap={6} wrap="nowrap">
            <ColorSwatch component="span" color={entry.color} size={8} withShadow={false} />
            {entry.other ? `${entry.label} (${entry.labs.length})` : entry.label}
          </Group>
        </Chip>
      ))}
    </Group>
  );
}
