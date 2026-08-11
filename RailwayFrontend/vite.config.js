import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    // Native subpath imports work automatically in Vite,
    // but configuring an alias block keeps the bundler strict
    alias: {
      '@': path.resolve(__dirname, './src'),
      '#components': '/src/components',
      '#lib': '/src/lib',
      '#hooks': '/src/hooks'
    }
  },
  server: {
    hmr: {
      // Forces a fallback if the websocket disconnects
      overlay: true,
      // Ensures the port stays strictly aligned
      clientPort: 5173,
    },
  },
});