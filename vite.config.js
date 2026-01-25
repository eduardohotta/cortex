import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
    plugins: [react()],
    css: {
        postcss: {
            plugins: [
                tailwindcss(),
                autoprefixer,
            ],
        },
    },
    base: './',
    root: 'src/renderer',
    publicDir: 'public',
    build: {
        outDir: '../../dist/renderer',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                dashboard: path.resolve(__dirname, 'src/renderer/dashboard/index.html'),
                overlay: path.resolve(__dirname, 'src/renderer/overlay/index.html')
            }
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src/renderer'),
            '@components': path.resolve(__dirname, 'src/renderer/components'),
            '@contexts': path.resolve(__dirname, 'src/renderer/contexts'),
            '@hooks': path.resolve(__dirname, 'src/renderer/hooks')
        }
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
