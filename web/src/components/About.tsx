import {
  ActionIcon,
  Anchor,
  Code,
  CopyButton,
  Group,
  List,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import type { ReactNode } from "react";
import { LINKS } from "../config";
import type { Snapshot } from "../data";
import { formatDate } from "../format";
import classes from "./About.module.css";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={classes.fact}>
      <Text className={classes.label}>{label}</Text>
      <Text size="md" component="div">
        {children}
      </Text>
    </div>
  );
}

function Hash({ value, href }: { value: string; href?: string }) {
  const short = value.length > 26 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  return (
    <Group gap={4} wrap="nowrap">
      <Code title={value} className={classes.code}>
        {href ? <Anchor href={href}>{short}</Anchor> : short}
      </Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy full value"}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={copy} aria-label="Copy">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                {copied ? (
                  <path d="M5 12l5 5L20 7" />
                ) : (
                  <>
                    <rect x="9" y="9" width="12" height="12" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </>
                )}
              </svg>
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

/** Plain-language method, provenance of this exact snapshot, and credits. */
export function About({ snapshot }: { snapshot: Snapshot }) {
  const { input, fit, build } = snapshot;
  return (
    <Stack gap={40}>
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing={40}>
        <Stack gap="xs">
          <Title order={3}>What is ECI?</Title>
          <Text c="dimmed" className={classes.prose}>
            The <Anchor href={LINKS.epochEci}>Epoch Capabilities Index</Anchor> puts every AI model
            on one capability scale. It is fitted jointly from dozens of benchmarks, so solving a
            hard benchmark counts for more and models tested on different benchmarks can still be
            compared. Two models fix the scale: Claude 3.5 Sonnet at 130 and GPT-5 at 150.
          </Text>
        </Stack>
        <Stack gap="xs">
          <Title order={3}>How this page is made</Title>
          <List spacing={8} size="md" c="dimmed" className={classes.prose}>
            <List.Item>
              A public GitHub Actions run downloads Epoch AI's daily <Code>benchmark_data.zip</Code>{" "}
              and hashes it.
            </List.Item>
            <List.Item>
              It fits ECI with Epoch's own <Anchor href={LINKS.eciPublic}>eci-public</Anchor>,
              pinned to one commit, plus {fit.bootstrap_samples} bootstrap refits for{" "}
              {Math.round(fit.ci_level * 100)}% intervals on scores and ranks.
            </List.Item>
            <List.Item>
              Every snapshot is kept on the{" "}
              <Anchor href={`${LINKS.repo}/tree/data`}>data branch</Anchor> and can be reproduced.
            </List.Item>
          </List>
        </Stack>
        <Stack gap="xs">
          <Title order={3}>Credits</Title>
          <Text c="dimmed" className={classes.prose}>
            Data by <Anchor href={LINKS.epochData}>Epoch AI</Anchor>, licensed{" "}
            <Anchor href={LINKS.ccBy}>CC BY 4.0</Anchor>. Method from{" "}
            <Anchor href={LINKS.paper} className={classes.keep}>
              A Rosetta Stone for AI Benchmarks
            </Anchor>{" "}
            (Ho et al.). Logos from Lobe Icons. Built by Sakina.
          </Text>
          <Text c="dimmed" className={classes.prose}>
            ECI Live is an independent refit of Epoch AI's index and is not affiliated with Epoch
            AI.
          </Text>
        </Stack>
      </SimpleGrid>

      <div className={classes.provenance}>
        <Title order={4} mb="md">
          Provenance of this snapshot
        </Title>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="lg" verticalSpacing="md">
          <Fact label="Snapshot">
            <Hash
              value={snapshot.id}
              href={`${LINKS.repo}/blob/data/snapshots/${snapshot.id}.json`}
            />
          </Fact>
          <Fact label="Data downloaded">
            {formatDate(input.fetched_at)}, {input.fetched_at.slice(11, 16)} UTC
          </Fact>
          <Fact label="Input SHA-256">
            <Hash value={input.sha256} href={input.archive_url ?? undefined} />
          </Fact>
          <Fact label="Workflow run">
            {build.run_url ? (
              <Anchor href={build.run_url}>#{build.run_url.split("/").at(-1)}</Anchor>
            ) : (
              "Local preview build"
            )}
          </Fact>
          <Fact label="eci-public commit">
            <Hash
              value={fit.eci_public_commit}
              href={`${LINKS.eciPublic}/tree/${fit.eci_public_commit}`}
            />
          </Fact>
          <Fact label="Site commit">
            {build.commit ? (
              <Hash value={build.commit} href={`${LINKS.repo}/tree/${build.commit}`} />
            ) : (
              "unknown"
            )}
          </Fact>
          <Fact label="Bootstrap">
            {fit.bootstrap_samples} refits, seed {fit.bootstrap_seed}, {fit.bootstrap_chunks} chunks
          </Fact>
        </SimpleGrid>
      </div>
    </Stack>
  );
}
