import "@fontsource-variable/geist";
import "@mantine/core/styles.layer.css";
import "mantine-datatable/styles.layer.css";
import "./global.css";

import { Center, Loader, MantineProvider } from "@mantine/core";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadSiteData } from "./data";
import { theme } from "./theme";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Suspense
        fallback={
          <Center h="100vh">
            <Loader type="dots" />
          </Center>
        }
      >
        <App data={loadSiteData()} />
      </Suspense>
    </MantineProvider>
  </StrictMode>,
);
