import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served as a GitHub project page, so every asset lives under /eci-live/.
export default defineConfig({
  base: "/eci-live/",
  plugins: [react()],
});
