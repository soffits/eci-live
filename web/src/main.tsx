import "@fontsource-variable/geist";
import "@mantine/core/styles.layer.css";
import "mantine-datatable/styles.layer.css";
import "./global.css";

import { Center, Loader, MantineProvider } from "@mantine/core";
import { NuqsAdapter } from "nuqs/adapters/react";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadSiteData } from "./data";
import { cssVariablesResolver, theme } from "./theme";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      <Suspense
        fallback={
          <Center h="100vh">
            <Loader type="dots" />
          </Center>
        }
      >
        <NuqsAdapter>
          <App data={loadSiteData()} />
        </NuqsAdapter>
      </Suspense>
    </MantineProvider>
  </StrictMode>,
);
