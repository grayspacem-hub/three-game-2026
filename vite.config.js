const { defineConfig } = require('vite');

module.exports = defineConfig({
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules')) return 'vendor';
          return null;
        },
      },
    },
  },
});
