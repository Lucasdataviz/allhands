// Gestão de contas: só o servidor tem a chave que cria usuários.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const DEFAULT_PASSWORD = "Mudar@123";
const DOMAIN = "allhands.local";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
function baseUsername(fullName: string) {
  const parts = slug(fullName).split(/\s+/).filter(Boolean);
  const skip = new Set(["de", "da", "do", "das", "dos", "e"]);
  const second = parts.slice(1).find((p) => !skip.has(p));
  return second ? `${parts[0]}.${second}` : parts[0] ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const body = await req.json();
    const action = body.action as string;

    async function createOne(u: any, role: string, password: string, mustChange: boolean) {
      const fullName = String(u.full_name ?? "").trim().replace(/\s+/g, " ");
      if (!fullName) throw new Error("Nome obrigatório.");
      let username = slug(String(u.username ?? "")).replace(/\s+/g, ".") || baseUsername(fullName);
      if (!username) throw new Error(`Não foi possível gerar usuário para "${fullName}".`);
      const base = username;
      for (let n = 2; ; n++) {
        const { data } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
        if (!data) break;
        if (u.username) throw new Error(`Usuário "${username}" já existe.`);
        username = `${base}${n}`;
      }
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${username}@${DOMAIN}`, password, email_confirm: true,
      });
      if (error) throw new Error(error.message);
      const { error: pe } = await admin.from("profiles").insert({
        id: created.user.id, username, full_name: fullName, sector: u.sector || null, branch: u.branch || null,
        role, must_change_password: mustChange, is_demo: !!u.is_demo,
      });
      if (pe) { await admin.auth.admin.deleteUser(created.user.id); throw new Error(pe.message); }
      return { id: created.user.id, username, full_name: fullName };
    }

    if (action === "bootstrap") {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) > 0) return json({ error: "Já existe um administrador." }, 403);
      if (String(body.password ?? "").length < 8) return json({ error: "A senha precisa ter ao menos 8 caracteres." }, 400);
      const u = await createOne({ full_name: body.full_name, username: body.username }, "admin", body.password, false);
      return json({ ok: true, user: u });
    }

    // Demais ações: só administrador ativo.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: who } = await admin.auth.getUser(token);
    if (!who?.user) return json({ error: "Sessão inválida." }, 401);
    const { data: me } = await admin.from("profiles").select("role, active").eq("id", who.user.id).maybeSingle();
    if (!me || me.role !== "admin" || !me.active) return json({ error: "Apenas administradores." }, 403);

    if (action === "create") {
      const list: any[] = Array.isArray(body.users) ? body.users : [];
      if (!list.length || list.length > 300) return json({ error: "Envie de 1 a 300 pessoas." }, 400);
      const created: any[] = [], errors: any[] = [];
      for (const u of list) {
        try {
          const role = ["admin", "colaborador", "telao"].includes(u.role) ? u.role : "colaborador";
          const c = await createOne(u, role, DEFAULT_PASSWORD, true);
          if (role === "colaborador" && body.event_id) {
            await admin.from("event_participants").insert({ event_id: body.event_id, user_id: c.id });
          }
          created.push(c);
        } catch (e) { errors.push({ full_name: u.full_name, error: (e as Error).message }); }
      }
      await admin.from("audit_log").insert({ event_id: body.event_id ?? null, actor_id: who.user.id, action: "usuarios.criar", details: { criados: created.length, erros: errors.length } });
      return json({ ok: true, created, errors, default_password: DEFAULT_PASSWORD });
    }

    if (action === "reset_password") {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: DEFAULT_PASSWORD });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ must_change_password: true }).eq("id", body.user_id);
      await admin.from("audit_log").insert({ actor_id: who.user.id, action: "usuarios.redefinir_senha", details: { user: body.user_id } });
      return json({ ok: true, default_password: DEFAULT_PASSWORD });
    }

    if (action === "delete") {
      if (body.user_id === who.user.id) return json({ error: "Você não pode excluir a própria conta." }, 400);
      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) return json({ error: "Não foi possível excluir (a pessoa já tem histórico). Desative a conta em vez de excluir." }, 400);
      await admin.from("audit_log").insert({ actor_id: who.user.id, action: "usuarios.excluir", details: { user: body.user_id } });
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
