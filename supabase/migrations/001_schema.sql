-- ALL HANDS — esquema, permissões e regras de negócio
-- Tudo que mexe em pontos, lances e correção de quiz roda aqui, dentro do banco, em transação.

-- ───────────────────────── Tabelas ─────────────────────────
create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date,
  status text not null default 'rascunho' check (status in ('rascunho','ativo','finalizado')),
  max_prizes_per_person int check (max_prizes_per_person is null or max_prizes_per_person > 0),
  welcome_message text,
  logo_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_active_event on events ((true)) where status = 'ativo';

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null,
  sector text,
  branch text,
  photo_url text,
  role text not null default 'colaborador' check (role in ('admin','colaborador','telao')),
  active boolean not null default true,
  must_change_password boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table event_participants (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table wallets (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  balance int not null default 0,   -- pontos na carteira (inclui os reservados)
  reserved int not null default 0,  -- presos em lance líder
  spent int not null default 0,     -- gastos em prêmios arrematados
  primary key (event_id, user_id),
  check (balance >= 0), check (reserved >= 0), check (reserved <= balance), check (spent >= 0)
);

-- Placar público (ranking). A carteira é privada; o placar não.
create table scores (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  earned int not null default 0 check (earned >= 0),
  reached_at timestamptz not null default now(),
  quizzes_done int not null default 0,
  prizes_won int not null default 0,
  primary key (event_id, user_id)
);

create table wallet_ledger (
  id bigint generated always as identity primary key,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('quiz','tarefa','ajuste','premio','estorno')),
  amount int not null,
  reason text not null,
  ref_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on wallet_ledger (event_id, user_id, created_at desc);

create table quizzes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'rascunho' check (status in ('rascunho','publicado','encerrado')),
  opens_at timestamptz,
  closes_at timestamptz,
  seconds_per_question int not null default 30 check (seconds_per_question between 5 and 600),
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  position int not null default 0,
  kind text not null default 'multipla' check (kind in ('multipla','vf')),
  body text not null,
  points int not null default 10 check (points >= 0)
);

create table options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  position int not null default 0,
  body text not null
);

-- Gabarito separado: nunca chega ao celular antes do quiz encerrar.
create table option_keys (
  option_id uuid primary key references options(id) on delete cascade,
  is_correct boolean not null default false
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  question_order uuid[] not null,
  current_index int not null default 0,
  current_started_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  points_earned int not null default 0,
  unique (quiz_id, user_id)
);

create table attempt_answers (
  attempt_id uuid not null references quiz_attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  option_id uuid references options(id) on delete set null,
  is_correct boolean not null,
  timed_out boolean not null default false,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  title text not null,
  description text,
  points int not null check (points > 0),
  created_at timestamptz not null default now()
);

create table task_completions (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  photo_url text,
  description text,
  category text,
  quantity int not null default 1 check (quantity > 0),
  quantity_sold int not null default 0,
  donor_id uuid references profiles(id) on delete set null,
  donor_name text,
  start_price int not null default 10 check (start_price > 0),
  min_increment int not null default 5 check (min_increment > 0),
  status text not null default 'disponivel' check (status in ('disponivel','em_leilao','arrematado','nao_arrematado')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table auctions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  prize_id uuid not null references prizes(id) on delete cascade,
  start_price int not null check (start_price > 0),
  min_increment int not null check (min_increment > 0),
  mode text not null default 'manual' check (mode in ('tempo','manual')),
  duration_seconds int check (duration_seconds is null or duration_seconds between 10 and 3600),
  status text not null default 'agendado' check (status in ('agendado','aberto','pausado','encerrado','cancelado')),
  result text check (result in ('arrematado','sem_lances','estornado')),
  round int not null default 1,
  started_at timestamptz,
  ends_at timestamptz,
  remaining_seconds numeric,
  current_bid int,
  current_bidder uuid references profiles(id),
  bid_count int not null default 0,
  participant_count int not null default 0,
  winner_id uuid references profiles(id),
  final_price int,
  closed_at timestamptz,
  delivered boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (mode = 'manual' or duration_seconds is not null)
);
-- Um leilão ao vivo por vez em cada evento.
create unique index one_live_auction on auctions (event_id) where status in ('aberto','pausado');

create table bids (
  id bigint generated always as identity primary key,
  auction_id uuid not null references auctions(id) on delete cascade,
  round int not null default 1,
  user_id uuid not null references profiles(id),
  amount int not null check (amount > 0),  -- quanto a pessoa somou neste lance
  total int,                               -- total acumulado dela no leilão após este lance
  voided boolean not null default false,
  created_at timestamptz not null default now()
);
create index on bids (auction_id, id desc);

create table display_state (
  event_id uuid primary key references events(id) on delete cascade,
  screen text not null default 'inicio' check (screen in ('inicio','ranking','quizzes','premios','leilao','resultado','historico','mensagem')),
  message text,
  auction_id uuid references auctions(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  event_id uuid,
  actor_id uuid,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Auxiliares ─────────────────────────
create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active)
$$;

create function server_now() returns timestamptz language sql stable as $$ select now() $$;

create function _audit(p_event uuid, p_action text, p_details jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (event_id, actor_id, action, details) values (p_event, auth.uid(), p_action, p_details)
$$;

create function _fail(p_code text, p_msg text) returns void language plpgsql as $$
begin raise exception '%', p_msg using errcode = 'P0001', hint = p_code; end $$;

-- Carteira e placar nascem junto com a participação no evento.
create function _on_participant() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into wallets (event_id, user_id) values (new.event_id, new.user_id) on conflict do nothing;
  insert into scores (event_id, user_id) values (new.event_id, new.user_id) on conflict do nothing;
  return new;
end $$;
create trigger trg_participant after insert on event_participants for each row execute function _on_participant();

create function _on_event() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into display_state (event_id) values (new.id) on conflict do nothing; return new; end $$;
create trigger trg_event after insert on events for each row execute function _on_event();

-- Crédito/débito atômico. Trava a linha da carteira.
create function _move_points(p_event uuid, p_user uuid, p_amount int, p_kind text, p_reason text, p_ref uuid, p_counts_for_rank boolean)
returns void language plpgsql security definer set search_path = public as $$
declare w wallets;
begin
  select * into w from wallets where event_id = p_event and user_id = p_user for update;
  if not found then perform _fail('sem_carteira', 'Colaborador não participa deste evento.'); end if;
  if p_amount < 0 and (w.balance - w.reserved) < -p_amount then
    perform _fail('saldo_insuficiente', 'Saldo disponível insuficiente.');
  end if;
  update wallets set balance = balance + p_amount where event_id = p_event and user_id = p_user;
  insert into wallet_ledger (event_id, user_id, kind, amount, reason, ref_id, created_by)
    values (p_event, p_user, p_kind, p_amount, p_reason, p_ref, auth.uid());
  if p_counts_for_rank then
    update scores set earned = greatest(earned + p_amount, 0),
                      reached_at = case when p_amount > 0 then now() else reached_at end
      where event_id = p_event and user_id = p_user;
  end if;
end $$;

-- ───────────────────────── Pontos (admin) ─────────────────────────
create function admin_adjust_points(p_event uuid, p_user uuid, p_amount int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then perform _fail('sem_permissao', 'Apenas administradores.'); end if;
  if p_amount = 0 then perform _fail('valor_invalido', 'Informe um valor diferente de zero.'); end if;
  if coalesce(trim(p_reason), '') = '' then perform _fail('motivo_obrigatorio', 'Informe o motivo.'); end if;
  perform _move_points(p_event, p_user, p_amount, 'ajuste', trim(p_reason), null, true);
  perform _audit(p_event, 'pontos.ajuste', jsonb_build_object('user', p_user, 'amount', p_amount, 'reason', p_reason));
end $$;

create function admin_set_task(p_task uuid, p_user uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t tasks;
begin
  if not is_admin() then perform _fail('sem_permissao', 'Apenas administradores.'); end if;
  select * into t from tasks where id = p_task;
  if not found then perform _fail('nao_encontrado', 'Tarefa não encontrada.'); end if;
  if p_done then
    insert into task_completions (task_id, user_id, granted_by) values (p_task, p_user, auth.uid()) on conflict do nothing;
    if found then perform _move_points(t.event_id, p_user, t.points, 'tarefa', 'Tarefa: ' || t.title, t.id, true); end if;
  else
    delete from task_completions where task_id = p_task and user_id = p_user;
    if found then perform _move_points(t.event_id, p_user, -t.points, 'tarefa', 'Tarefa desmarcada: ' || t.title, t.id, true); end if;
  end if;
  perform _audit(t.event_id, 'tarefa.marcar', jsonb_build_object('task', p_task, 'user', p_user, 'done', p_done));
end $$;

-- ───────────────────────── Quiz ─────────────────────────
create function _quiz_open(q quizzes) returns boolean language sql stable as $$
  select q.status = 'publicado' and (q.opens_at is null or q.opens_at <= now()) and (q.closes_at is null or q.closes_at > now())
$$;

-- Finaliza a tentativa e credita os pontos (uma única vez).
create function _finish_attempt(p_attempt uuid) returns void language plpgsql security definer set search_path = public as $$
declare a quiz_attempts; q quizzes; v_ok int; v_bad int; v_pts int;
begin
  select * into a from quiz_attempts where id = p_attempt for update;
  if a.finished_at is not null then return; end if;
  select * into q from quizzes where id = a.quiz_id;
  select count(*) filter (where aa.is_correct), count(*) filter (where not aa.is_correct),
         coalesce(sum(qq.points) filter (where aa.is_correct), 0)
    into v_ok, v_bad, v_pts
    from attempt_answers aa join questions qq on qq.id = aa.question_id where aa.attempt_id = p_attempt;
  v_bad := coalesce(array_length(a.question_order, 1), 0) - v_ok;
  update quiz_attempts set finished_at = now(), correct_count = v_ok, wrong_count = v_bad, points_earned = v_pts where id = p_attempt;
  if v_pts > 0 then
    perform _move_points(q.event_id, a.user_id, v_pts, 'quiz', 'Quiz: ' || q.title, q.id, true);
  end if;
  update scores set quizzes_done = quizzes_done + 1 where event_id = q.event_id and user_id = a.user_id;
end $$;

-- Devolve o estado atual da tentativa: próxima pergunta (sem gabarito) ou o resultado.
create function quiz_state(p_quiz uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare a quiz_attempts; q quizzes; v_total int; v_qid uuid; v_question questions; v_deadline timestamptz; v_me profiles;
begin
  select * into v_me from profiles where id = auth.uid();
  if v_me.id is null or not v_me.active or v_me.role <> 'colaborador' then perform _fail('sem_permissao', 'Apenas colaboradores ativos respondem quizzes.'); end if;
  select * into q from quizzes where id = p_quiz;
  if not found then perform _fail('nao_encontrado', 'Quiz não encontrado.'); end if;
  if not exists (select 1 from event_participants where event_id = q.event_id and user_id = v_me.id) then
    perform _fail('sem_permissao', 'Você não participa deste evento.');
  end if;
  select * into a from quiz_attempts where quiz_id = p_quiz and user_id = v_me.id for update;
  if not found then
    if not _quiz_open(q) then perform _fail('quiz_fechado', 'Este quiz não está disponível.'); end if;
    insert into quiz_attempts (quiz_id, user_id, question_order)
      select p_quiz, v_me.id, coalesce(array_agg(id order by random()), '{}') from questions where quiz_id = p_quiz
      on conflict (quiz_id, user_id) do nothing;
    select * into a from quiz_attempts where quiz_id = p_quiz and user_id = v_me.id for update;
  end if;
  v_total := coalesce(array_length(a.question_order, 1), 0);
  loop
    exit when a.finished_at is not null;
    if a.current_index >= v_total or not _quiz_open(q) then
      perform _finish_attempt(a.id);
      select * into a from quiz_attempts where id = a.id;
      exit;
    end if;
    v_qid := a.question_order[a.current_index + 1];
    if a.current_started_at is null then
      update quiz_attempts set current_started_at = now() where id = a.id returning * into a;
    end if;
    v_deadline := a.current_started_at + make_interval(secs => q.seconds_per_question);
    if now() > v_deadline + interval '2 seconds' then
      -- tempo esgotado: conta como erro e segue
      insert into attempt_answers (attempt_id, question_id, option_id, is_correct, timed_out)
        values (a.id, v_qid, null, false, true) on conflict do nothing;
      update quiz_attempts set current_index = current_index + 1, current_started_at = null where id = a.id returning * into a;
      continue;
    end if;
    select * into v_question from questions where id = v_qid;
    return jsonb_build_object(
      'finished', false, 'attempt_id', a.id, 'index', a.current_index, 'total', v_total,
      'deadline', v_deadline, 'seconds', q.seconds_per_question, 'server_now', now(),
      'question', jsonb_build_object('id', v_question.id, 'body', v_question.body, 'kind', v_question.kind, 'points', v_question.points,
        'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body) order by md5(o.id::text || a.id::text)), '[]')
                    from options o where o.question_id = v_question.id)));
  end loop;
  return jsonb_build_object('finished', true, 'attempt_id', a.id, 'total', v_total,
    'correct', a.correct_count, 'wrong', a.wrong_count, 'points', a.points_earned);
end $$;

create function quiz_answer(p_quiz uuid, p_question uuid, p_option uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a quiz_attempts; q quizzes; v_ok boolean;
begin
  select * into q from quizzes where id = p_quiz;
  select * into a from quiz_attempts where quiz_id = p_quiz and user_id = auth.uid() for update;
  if not found or a.finished_at is not null then return quiz_state(p_quiz); end if;
  if a.question_order[a.current_index + 1] is distinct from p_question or a.current_started_at is null then
    return quiz_state(p_quiz); -- pergunta fora de ordem: ignora e devolve o estado real
  end if;
  if now() <= a.current_started_at + make_interval(secs => q.seconds_per_question) + interval '2 seconds' and _quiz_open(q) then
    select coalesce(k.is_correct, false) into v_ok from options o left join option_keys k on k.option_id = o.id
      where o.id = p_option and o.question_id = p_question;
    if not found then perform _fail('opcao_invalida', 'Alternativa inválida.'); end if;
    insert into attempt_answers (attempt_id, question_id, option_id, is_correct) values (a.id, p_question, p_option, v_ok)
      on conflict do nothing;
    update quiz_attempts set current_index = current_index + 1, current_started_at = null where id = a.id;
  end if;
  return quiz_state(p_quiz);
end $$;

-- ───────────────────────── Leilão ─────────────────────────
create function _release_leader(a auctions) returns void language plpgsql security definer set search_path = public as $$
begin
  if a.current_bidder is not null then
    update wallets set reserved = reserved - a.current_bid where event_id = a.event_id and user_id = a.current_bidder;
  end if;
end $$;

-- Encerramento: sempre decidido aqui, com o leilão travado. Idempotente.
create function _close_auction(p_auction uuid) returns void language plpgsql security definer set search_path = public as $$
declare a auctions; p prizes;
begin
  select * into a from auctions where id = p_auction for update;
  if a.status not in ('aberto','pausado') then return; end if;
  select * into p from prizes where id = a.prize_id for update;
  if a.current_bidder is null then
    update auctions set status = 'encerrado', result = 'sem_lances', closed_at = now() where id = a.id;
    update prizes set status = case when quantity_sold >= quantity then 'arrematado' else 'nao_arrematado' end where id = p.id;
  else
    perform 1 from wallets where event_id = a.event_id and user_id = a.current_bidder for update;
    update wallets set reserved = reserved - a.current_bid, balance = balance - a.current_bid, spent = spent + a.current_bid
      where event_id = a.event_id and user_id = a.current_bidder;
    insert into wallet_ledger (event_id, user_id, kind, amount, reason, ref_id, created_by)
      values (a.event_id, a.current_bidder, 'premio', -a.current_bid, 'Prêmio arrematado: ' || p.name, a.id, auth.uid());
    update scores set prizes_won = prizes_won + 1 where event_id = a.event_id and user_id = a.current_bidder;
    update auctions set status = 'encerrado', result = 'arrematado', winner_id = a.current_bidder, final_price = a.current_bid, closed_at = now()
      where id = a.id;
    update prizes set quantity_sold = quantity_sold + 1,
                      status = case when quantity_sold + 1 >= quantity then 'arrematado' else 'disponivel' end where id = p.id;
  end if;
  update display_state set screen = 'resultado', auction_id = a.id, updated_at = now() where event_id = a.event_id;
  perform _audit(a.event_id, 'leilao.encerrado', jsonb_build_object('auction', a.id, 'winner', a.current_bidder, 'price', a.current_bid));
end $$;

-- Fecha leilões por tempo vencidos. Chamado pela rotina agendada e por qualquer tela quando o relógio zera;
-- quem decide é sempre o relógio do servidor.
create function close_expired_auctions() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from auctions where status = 'aberto' and mode = 'tempo' and ends_at <= now() loop
    perform _close_auction(r.id); n := n + 1;
  end loop;
  return n;
end $$;

create function place_bid(p_auction uuid, p_amount int) returns jsonb
language plpgsql security definer set search_path = public as $$
-- Lances somam por pessoa: p_amount é quanto ela acrescenta; lidera quem tiver o maior total.
declare a auctions; p prizes; me profiles; w wallets; ev events; v_min int; v_won int; v_free int; v_mine int; v_total int;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null or not me.active or me.role <> 'colaborador' then perform _fail('sem_permissao', 'Apenas colaboradores ativos podem dar lances.'); end if;
  select * into a from auctions where id = p_auction for update;  -- fila única por leilão
  if not found then perform _fail('nao_encontrado', 'Leilão não encontrado.'); end if;
  if a.status = 'aberto' and a.mode = 'tempo' and a.ends_at <= now() then
    perform _close_auction(a.id);
    return jsonb_build_object('ok', false, 'code', 'encerrado', 'message', 'O leilão já encerrou.');
  end if;
  if a.status = 'pausado' then return jsonb_build_object('ok', false, 'code', 'pausado', 'message', 'Leilão pausado.'); end if;
  if a.status <> 'aberto' then return jsonb_build_object('ok', false, 'code', 'encerrado', 'message', 'O leilão não está aberto.'); end if;
  select * into ev from events where id = a.event_id;
  select * into p from prizes where id = a.prize_id;
  if p.donor_id = me.id then return jsonb_build_object('ok', false, 'code', 'doador', 'message', 'Você ofereceu este prêmio e não pode dar lance nele.'); end if;
  if ev.max_prizes_per_person is not null then
    select count(*) into v_won from auctions where event_id = a.event_id and winner_id = me.id and result = 'arrematado';
    if v_won >= ev.max_prizes_per_person then
      return jsonb_build_object('ok', false, 'code', 'limite_premios', 'message', 'Você já atingiu o limite de prêmios deste evento.');
    end if;
  end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('ok', false, 'code', 'lance_baixo', 'message', 'Informe um valor maior que zero.'); end if;
  select coalesce(sum(amount), 0) into v_mine from bids where auction_id = a.id and round = a.round and user_id = me.id and not voided;
  v_total := v_mine + p_amount;
  if a.current_bidder = me.id then
    if p_amount < a.min_increment then
      return jsonb_build_object('ok', false, 'code', 'lance_baixo', 'message', 'O aumento mínimo é ' || a.min_increment || '.', 'min_add', a.min_increment);
    end if;
  else
    v_min := case when a.current_bid is null then a.start_price else a.current_bid + a.min_increment end;
    if v_total < v_min then
      return jsonb_build_object('ok', false, 'code', 'lance_baixo', 'message', 'Para assumir a liderança seu total precisa chegar a ' || v_min || '. Some pelo menos ' || (v_min - v_mine) || '.', 'min_add', v_min - v_mine);
    end if;
  end if;
  select * into w from wallets where event_id = a.event_id and user_id = me.id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'sem_carteira', 'message', 'Você não participa deste evento.'); end if;
  -- Só o líder tem pontos reservados (o total dele). Quem já lidera reaproveita a própria reserva.
  v_free := w.balance - w.reserved + case when a.current_bidder = me.id then a.current_bid else 0 end;
  if v_free < v_total then
    return jsonb_build_object('ok', false, 'code', 'saldo_insuficiente', 'message', 'Pontos insuficientes: seu total iria a ' || v_total || ' e você tem ' || v_free || '.', 'available', v_free);
  end if;
  perform _release_leader(a);
  update wallets set reserved = reserved + v_total where event_id = a.event_id and user_id = me.id;
  insert into bids (auction_id, round, user_id, amount, total) values (a.id, a.round, me.id, p_amount, v_total);
  update auctions set current_bid = v_total, current_bidder = me.id, bid_count = bid_count + 1,
    participant_count = (select count(distinct user_id) from bids where auction_id = a.id and round = a.round and not voided),
    ends_at = case when mode = 'tempo' and ends_at - now() < interval '10 seconds' then now() + interval '10 seconds' else ends_at end
    where id = a.id;
  return jsonb_build_object('ok', true, 'amount', p_amount, 'total', v_total);
end $$;

create function admin_auction_action(p_auction uuid, p_action text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a auctions; p prizes;
begin
  if not is_admin() then perform _fail('sem_permissao', 'Apenas administradores.'); end if;
  select * into a from auctions where id = p_auction for update;
  if not found then perform _fail('nao_encontrado', 'Leilão não encontrado.'); end if;
  select * into p from prizes where id = a.prize_id for update;

  if p_action = 'iniciar' then
    if a.status <> 'agendado' then perform _fail('estado_invalido', 'Só é possível iniciar um leilão agendado.'); end if;
    if exists (select 1 from auctions where event_id = a.event_id and status in ('aberto','pausado')) then
      perform _fail('ja_existe_aberto', 'Já existe um leilão em andamento. Encerre-o antes de iniciar outro.');
    end if;
    if p.quantity_sold >= p.quantity then perform _fail('sem_estoque', 'Todas as unidades deste prêmio já foram arrematadas.'); end if;
    update auctions set status = 'aberto', started_at = now(),
      ends_at = case when mode = 'tempo' then now() + make_interval(secs => duration_seconds) end where id = a.id;
    update prizes set status = 'em_leilao' where id = p.id;
    update display_state set screen = 'leilao', auction_id = a.id, updated_at = now() where event_id = a.event_id;

  elsif p_action = 'pausar' then
    if a.status <> 'aberto' then perform _fail('estado_invalido', 'O leilão não está aberto.'); end if;
    update auctions set status = 'pausado',
      remaining_seconds = case when mode = 'tempo' then greatest(extract(epoch from ends_at - now()), 1) end where id = a.id;

  elsif p_action = 'retomar' then
    if a.status <> 'pausado' then perform _fail('estado_invalido', 'O leilão não está pausado.'); end if;
    update auctions set status = 'aberto',
      ends_at = case when mode = 'tempo' then now() + make_interval(secs => remaining_seconds::double precision) end, remaining_seconds = null where id = a.id;

  elsif p_action = 'encerrar' then
    if a.status not in ('aberto','pausado') then perform _fail('estado_invalido', 'O leilão não está em andamento.'); end if;
    perform _close_auction(a.id);

  elsif p_action = 'cancelar' then
    if a.status not in ('agendado','aberto','pausado') then perform _fail('estado_invalido', 'Este leilão não pode mais ser cancelado.'); end if;
    perform _release_leader(a);
    update bids set voided = true where auction_id = a.id and round = a.round;
    update auctions set status = 'cancelado', current_bid = null, current_bidder = null, closed_at = now() where id = a.id;
    update prizes set status = case when quantity_sold >= quantity then 'arrematado' else 'disponivel' end where id = p.id;
    update display_state set screen = 'inicio', auction_id = null, updated_at = now() where event_id = a.event_id and auction_id = a.id;

  elsif p_action = 'reiniciar' then
    if a.result = 'arrematado' then perform _fail('estado_invalido', 'Leilão com vencedor: use o estorno.'); end if;
    perform _release_leader(a);
    update bids set voided = true where auction_id = a.id and round = a.round;
    update auctions set status = 'agendado', result = null, round = round + 1, current_bid = null, current_bidder = null, bid_count = 0,
      participant_count = 0, started_at = null, ends_at = null, remaining_seconds = null, closed_at = null where id = a.id;
    update prizes set status = case when quantity_sold >= quantity then 'arrematado' else 'disponivel' end where id = p.id;
    update display_state set screen = 'inicio', auction_id = null, updated_at = now() where event_id = a.event_id and auction_id = a.id;

  elsif p_action = 'estornar' then
    if a.result is distinct from 'arrematado' then perform _fail('estado_invalido', 'Só é possível estornar um leilão arrematado.'); end if;
    if coalesce(trim(p_reason), '') = '' then perform _fail('motivo_obrigatorio', 'Informe o motivo do estorno.'); end if;
    perform 1 from wallets where event_id = a.event_id and user_id = a.winner_id for update;
    update wallets set balance = balance + a.final_price, spent = spent - a.final_price where event_id = a.event_id and user_id = a.winner_id;
    insert into wallet_ledger (event_id, user_id, kind, amount, reason, ref_id, created_by)
      values (a.event_id, a.winner_id, 'estorno', a.final_price, 'Estorno: ' || p.name || ' — ' || trim(p_reason), a.id, auth.uid());
    update scores set prizes_won = greatest(prizes_won - 1, 0) where event_id = a.event_id and user_id = a.winner_id;
    update auctions set result = 'estornado', status = 'cancelado', delivered = false where id = a.id;
    update prizes set quantity_sold = greatest(quantity_sold - 1, 0), status = 'disponivel' where id = p.id;

  elsif p_action = 'entregar' then
    if a.result is distinct from 'arrematado' then perform _fail('estado_invalido', 'Leilão sem vencedor.'); end if;
    update auctions set delivered = not delivered where id = a.id;

  else
    perform _fail('acao_invalida', 'Ação desconhecida.');
  end if;
  perform _audit(a.event_id, 'leilao.' || p_action, jsonb_build_object('auction', a.id, 'prize', p.name, 'reason', p_reason));
end $$;

-- ───────────────────────── Perfil ─────────────────────────
create function my_password_changed() returns void language sql security definer set search_path = public as $$
  update profiles set must_change_password = false where id = auth.uid()
$$;
create function set_my_photo(p_url text) returns void language sql security definer set search_path = public as $$
  update profiles set photo_url = p_url where id = auth.uid()
$$;

-- Trilha de auditoria para cadastros feitos pelo admin.
create function _audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  if auth.uid() is not null then
    insert into audit_log (event_id, actor_id, action, details)
    values (coalesce((r->>'event_id')::uuid, case when tg_table_name = 'events' then (r->>'id')::uuid end), auth.uid(),
            tg_table_name || '.' || lower(tg_op), jsonb_build_object('id', r->>'id', 'nome', coalesce(r->>'name', r->>'title', r->>'full_name')));
  end if;
  return coalesce(new, old);
end $$;
create trigger aud_events after insert or update or delete on events for each row execute function _audit_row();
create trigger aud_quizzes after insert or update or delete on quizzes for each row execute function _audit_row();
create trigger aud_tasks after insert or update or delete on tasks for each row execute function _audit_row();
create trigger aud_prizes after insert or delete on prizes for each row execute function _audit_row();
create trigger aud_auctions after insert or delete on auctions for each row execute function _audit_row();
create trigger aud_profiles after insert or update or delete on profiles for each row execute function _audit_row();

-- ───────────────────────── Permissões (RLS) ─────────────────────────
alter table events enable row level security;
alter table profiles enable row level security;
alter table event_participants enable row level security;
alter table wallets enable row level security;
alter table scores enable row level security;
alter table wallet_ledger enable row level security;
alter table quizzes enable row level security;
alter table questions enable row level security;
alter table options enable row level security;
alter table option_keys enable row level security;
alter table quiz_attempts enable row level security;
alter table attempt_answers enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table prizes enable row level security;
alter table auctions enable row level security;
alter table bids enable row level security;
alter table display_state enable row level security;
alter table audit_log enable row level security;

-- Leitura pública (para quem está logado): o que aparece no telão e no ranking.
create policy r_events on events for select to authenticated using (true);
create policy r_profiles on profiles for select to authenticated using (true);
create policy r_participants on event_participants for select to authenticated using (true);
create policy r_scores on scores for select to authenticated using (true);
create policy r_prizes on prizes for select to authenticated using (true);
create policy r_auctions on auctions for select to authenticated using (true);
create policy r_bids on bids for select to authenticated using (true);
create policy r_display on display_state for select to authenticated using (true);
create policy r_tasks on tasks for select to authenticated using (true);
create policy r_quizzes on quizzes for select to authenticated using (status <> 'rascunho' or is_admin());

-- Privado: só o dono ou o admin.
create policy r_wallets on wallets for select to authenticated using (user_id = auth.uid() or is_admin());
create policy r_ledger on wallet_ledger for select to authenticated using (user_id = auth.uid() or is_admin());
create policy r_attempts on quiz_attempts for select to authenticated using (user_id = auth.uid() or is_admin());
create policy r_task_done on task_completions for select to authenticated using (user_id = auth.uid() or is_admin());
create policy r_answers on attempt_answers for select to authenticated using (
  is_admin() or exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid()));

-- Perguntas e gabarito: admin sempre; colaborador só depois que o quiz encerra.
create policy r_questions on questions for select to authenticated using (
  is_admin() or exists (select 1 from quizzes q where q.id = quiz_id and (q.status = 'encerrado' or q.closes_at <= now())));
create policy r_options on options for select to authenticated using (
  is_admin() or exists (select 1 from questions qq join quizzes q on q.id = qq.quiz_id
                        where qq.id = question_id and (q.status = 'encerrado' or q.closes_at <= now())));
create policy r_keys on option_keys for select to authenticated using (
  is_admin() or exists (select 1 from options o join questions qq on qq.id = o.question_id join quizzes q on q.id = qq.quiz_id
                        where o.id = option_id and (q.status = 'encerrado' or q.closes_at <= now())));
create policy r_audit on audit_log for select to authenticated using (is_admin());

-- Escrita direta: só admin, e só nos cadastros. Pontos, lances e tentativas só mudam pelas funções.
create policy w_events on events for all to authenticated using (is_admin()) with check (is_admin());
create policy w_profiles on profiles for update to authenticated using (is_admin()) with check (is_admin());
create policy w_participants on event_participants for all to authenticated using (is_admin()) with check (is_admin());
create policy w_quizzes on quizzes for all to authenticated using (is_admin()) with check (is_admin());
create policy w_questions on questions for all to authenticated using (is_admin()) with check (is_admin());
create policy w_options on options for all to authenticated using (is_admin()) with check (is_admin());
create policy w_keys on option_keys for all to authenticated using (is_admin()) with check (is_admin());
create policy w_tasks on tasks for all to authenticated using (is_admin()) with check (is_admin());
create policy w_prizes on prizes for all to authenticated using (is_admin()) with check (is_admin());
create policy w_display on display_state for update to authenticated using (is_admin()) with check (is_admin());
create policy i_auctions on auctions for insert to authenticated with check (is_admin() and status = 'agendado');
create policy u_auctions on auctions for update to authenticated using (is_admin() and status = 'agendado') with check (is_admin() and status = 'agendado');
create policy d_auctions on auctions for delete to authenticated using (is_admin() and status in ('agendado','cancelado'));

-- Funções internas não são chamáveis pelo aplicativo.
revoke execute on function _move_points, _finish_attempt, _close_auction, _release_leader, _audit, _fail, _quiz_open from public;
