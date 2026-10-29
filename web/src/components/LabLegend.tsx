import { Chip, ColorSwatch, Group } from "@mantine/core";
import { useLabColor } from "./LabLogo";

interface Props {
  labs: string[];
  selected: string[];
  onToggle: (lab: string) => void;
}

/** Colour key for the lab colours; clicking a lab toggles it in the shared lab filter. */
export function LabLegend({ labs, selected, onToggle }: Props) {
  const colorOf = useLabColor();
  return (
    <Group gap={6}>
      {labs.map((lab) => (
        <Chip
          key={lab}
          size="xs"
          variant="outline"
          checked={selected.includes(lab)}
          onChange={() => onToggle(lab)}
          color={colorOf(lab)}
        >
          <Group component="span" gap={6} wrap="nowrap">
            <ColorSwatch component="span" color={colorOf(lab)} size={8} withShadow={false} />
            {lab}
          </Group>
        </Chip>
      ))}
    </Group>
  );
}
