import { Chip, Group } from "@mantine/core";
import { LabLogo, useLabColor } from "./LabLogo";

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
          radius="xl"
          variant="outline"
          checked={selected.includes(lab)}
          onChange={() => onToggle(lab)}
          color={colorOf(lab)}
          icon={<LabLogo lab={lab} size={12} />}
          styles={{ label: { gap: 4, paddingInline: 10 } }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: 4,
              marginRight: 6,
              background: colorOf(lab),
            }}
          />
          {lab}
        </Chip>
      ))}
    </Group>
  );
}
