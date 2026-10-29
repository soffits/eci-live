import { Anchor, Code, List, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { LINKS } from "../config";
import type { Snapshot } from "../data";
import { formatDate } from "../format";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={0.5}>
        {label}
      </Text>
      <Text size="sm" style={{ overflowWrap: "anywhere" }}>
        {children}
      </Text>
    </div>
  );
}

const short = (sha: string) => sha.slice(0, 12);

/** Plain-language method, provenance of this exact snapshot, and credits. */
export function About({ snapshot }: { snapshot: Snapshot }) {
  const { input, fit, build, drift } = snapshot;
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
      <Stack gap="sm">
        <Title order={3}>What is ECI?</Title>
        <Text>
          The <Anchor href={LINKS.epochEci}>Epoch Capabilities Index</Anchor> puts every AI model on
          one capability scale. It's fitted jointly from dozens of benchmarks, so a model is
          credited for solving hard ones and models tested on different benchmarks can still be
          compared. The scale is pinned by two models: Claude 3.5 Sonnet sits at 130 and GPT-5 at
          150.
        </Text>
        <Title order={3} mt="sm">
          How this page is computed
        </Title>
        <List spacing={6} size="sm">
          <List.Item>
            A public GitHub Actions workflow downloads Epoch AI's daily{" "}
            <Code>benchmark_data.zip</Code> and records its SHA-256.
          </List.Item>
          <List.Item>
            It fits ECI with Epoch's own open-source code (
            <Anchor href={LINKS.eciPublic}>eci-public</Anchor>, pinned to one commit) and{" "}
            {fit.bootstrap_samples} bootstrap refits for {Math.round(fit.ci_level * 100)}%
            confidence intervals. The method comes from the paper{" "}
            <Anchor href={LINKS.paper}>A Rosetta Stone for AI Benchmarks</Anchor>.
          </List.Item>
          <List.Item>
            Before anything is published, the refit is compared with Epoch's official scores in the
            same zip. If any shared model drifts by more than {drift.tolerance} points, the run
            fails. Models Epoch hasn't scored yet are marked <em>Not yet on Epoch</em>.
          </List.Item>
          <List.Item>
            Every snapshot is kept, with its input hash and provenance, on the repository's{" "}
            <Anchor href={`${LINKS.repo}/tree/data`}>data branch</Anchor>, so any snapshot can be
            reproduced.
          </List.Item>
        </List>
        <Text size="sm" c="dimmed" mt="sm">
          Unofficial refit, not affiliated with or endorsed by Epoch AI. Data by{" "}
          <Anchor href={LINKS.epochData}>Epoch AI</Anchor>, licensed{" "}
          <Anchor href={LINKS.ccBy}>CC BY 4.0</Anchor>. Built by Sakina.
        </Text>
      </Stack>
      <Stack gap="md">
        <Title order={3}>This snapshot</Title>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
          <Fact label="Snapshot">{snapshot.id}</Fact>
          <Fact label="Data downloaded">
            {formatDate(input.fetched_at)}, {input.fetched_at.slice(11, 16)} UTC
          </Fact>
          <Fact label="Input SHA-256">
            <Code>{input.sha256}</Code>
          </Fact>
          <Fact label="Input archive">
            {input.archive_url ? (
              <Anchor href={input.archive_url}>benchmark_data.zip</Anchor>
            ) : (
              "not archived (local build)"
            )}
          </Fact>
          <Fact label="eci-public commit">
            <Anchor href={`${LINKS.eciPublic}/tree/${fit.eci_public_commit}`}>
              <Code>{short(fit.eci_public_commit)}</Code>
            </Anchor>
          </Fact>
          <Fact label="Workflow run">
            {build.run_url ? (
              <Anchor href={build.run_url}>{build.run_url.split("/").at(-1)}</Anchor>
            ) : (
              "local build, not published"
            )}
          </Fact>
          <Fact label="Site commit">
            {build.commit ? (
              <Anchor href={`${LINKS.repo}/tree/${build.commit}`}>
                <Code>{short(build.commit)}</Code>
              </Anchor>
            ) : (
              "unknown"
            )}
          </Fact>
          <Fact label="Agreement with Epoch">
            {drift.shared_models} shared models, mean gap {drift.mean_abs.toFixed(2)}, max{" "}
            {drift.max_abs.toFixed(2)}
          </Fact>
        </SimpleGrid>
      </Stack>
    </SimpleGrid>
  );
}
