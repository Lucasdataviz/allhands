# All Hands — quizzes, carteira de pontos e leilões

- `web/` — aplicativo (React + Vite). `npm install && npm run build` gera `web/dist/index.html`, um arquivo único com as três áreas:
  colaborador (`/`), admin (entra como administrador) e telão (`#/telao`).
- `supabase/migrations/001_schema.sql` — banco, permissões e regras (já aplicado no projeto Supabase "All Hands").
- `supabase/functions/admin-users/` — função que cria contas e redefine senhas (já publicada).
- `supabase/tests/` — 37 testes das regras de negócio em Postgres local (`node run.mjs`).

Hospedagem: sirva `index.html` em qualquer endereço HTTPS (webhook do n8n respondendo o arquivo como text/html,
Vercel, Cloudflare Pages, servidor próprio). Não há variáveis de ambiente: o endereço do Supabase e a chave pública estão em `web/src/lib.js`.
