import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
// Um único index.html no final: fácil de servir por um webhook do n8n ou qualquer hospedagem.
export default defineConfig({ plugins: [react(), viteSingleFile()], build: { chunkSizeWarningLimit: 4000 } })
