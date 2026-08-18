import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    /*
     * NOTE: there was a `define` block here that inlined GEMINI_API_KEY into the
     * client bundle:
     *
     *   'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
     *
     * Anything placed in `define` is substituted as a literal into the JavaScript
     * shipped to the browser, so the key was readable by every visitor via
     * view-source. No client code referenced it, so it leaked without being used.
     *
     * If a Gemini feature is added later, call it from the Express server (where
     * process.env is genuinely private) and expose a normal API route to the UI.
     * Never reintroduce a secret here.
     */
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
