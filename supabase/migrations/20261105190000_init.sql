-- Мини-CRM «Объекты и задачи».
--
-- Две разные защиты, потому что это две разные задачи:
--   * Объекты — обычные строки. Кто их видит и кто их меняет, решает RLS.
--   * Задачи и история — цепочка статусов. Политика RLS видит только новую
--     строку и не может сравнить её со старой, поэтому прямую запись
--     ролям anon и authenticated закрываем полностью. Писать могут только
--     процедуры create_task, update_task и transition_task. Они же пишут
--     историю и ставят служебный флаг, без которого триггер запись отвергает.
--
-- service_role обходит RLS. Поэтому триггер нужен даже при отозванных правах:
-- ключ администратора тоже не сможет подделать историю, если не вызвал процедуру.
-- Этот ключ не должен попадать во фронтенд.
--
-- Не включайте FORCE ROW LEVEL SECURITY на tasks и status_history:
-- процедуры выполняются от имени владельца таблицы и тогда перестанут писать.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  role text not null check (role in ('manager', 'executor'))
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  object_id uuid not null references public.objects (id) on delete restrict,
  assignee_id uuid not null references public.profiles (id),
  status text not null default 'Новая' check (
    status in ('Новая', 'В работе', 'На проверке', 'Принята', 'На доработке')
  ),
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete restrict,
  actor_id uuid not null references public.profiles (id),
  from_status text check (
    from_status is null
    or from_status in ('Новая', 'В работе', 'На проверке', 'Принята', 'На доработке')
  ),
  to_status text not null check (
    to_status in ('Новая', 'В работе', 'На проверке', 'Принята', 'На доработке')
  ),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index status_history_task_id_idx on public.status_history (task_id);

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'manager'
  );
$$;

create or replace function public.guard_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_profile_write', true), '') <> 'on' then
    raise exception 'Роль и имя задаёт администратор, через приложение их не меняют';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger profiles_guard
before insert or update or delete on public.profiles
for each row execute function public.guard_profiles();

create or replace function public.guard_objects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if not public.is_manager() then
      raise exception 'Удалять объекты может только постановщик';
    end if;
    if exists (select 1 from public.tasks where object_id = old.id) then
      raise exception 'Нельзя удалить объект, пока на нём есть задачи';
    end if;
    return old;
  end if;

  if not public.is_manager() then
    raise exception 'Менять объекты может только постановщик';
  end if;

  new.name := btrim(coalesce(new.name, ''));
  new.address := btrim(coalesce(new.address, ''));
  if char_length(new.name) = 0 or char_length(new.address) = 0 then
    raise exception 'Укажите название и адрес';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger objects_guard
before insert or update or delete on public.objects
for each row execute function public.guard_objects();

create or replace function public.guard_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mode text := coalesce(current_setting('app.task_write_mode', true), '');
begin
  if tg_op = 'DELETE' then
    raise exception 'Задачу нельзя удалить: вместе с ней пропала бы история';
  end if;

  if mode = '' then
    raise exception 'Задачи меняются только процедурами системы';
  end if;

  if tg_op = 'INSERT' then
    if mode <> 'insert' then
      raise exception 'Создать задачу так нельзя';
    end if;
    if auth.uid() is null then
      raise exception 'Сначала войдите в систему';
    end if;
    if not exists (
      select 1 from public.profiles
      where id = new.assignee_id and role = 'executor'
    ) then
      raise exception 'Назначить можно только исполнителя';
    end if;
    new.status := 'Новая';
    new.author_id := auth.uid();
    new.created_at := now();
    return new;
  end if;

  if mode = 'fields' then
    new.id := old.id;
    new.status := old.status;
    new.assignee_id := old.assignee_id;
    new.author_id := old.author_id;
    new.object_id := old.object_id;
    new.created_at := old.created_at;
    return new;
  end if;

  if mode = 'status' then
    new.id := old.id;
    new.title := old.title;
    new.description := old.description;
    new.assignee_id := old.assignee_id;
    new.author_id := old.author_id;
    new.object_id := old.object_id;
    new.created_at := old.created_at;
    return new;
  end if;

  raise exception 'Недопустимая запись задачи';
end;
$$;

create trigger tasks_guard
before insert or update or delete on public.tasks
for each row execute function public.guard_tasks();

create or replace function public.guard_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Историю статусов нельзя изменить или удалить';
  end if;
  if coalesce(current_setting('app.allow_history_write', true), '') <> 'on' then
    raise exception 'Историю статусов нельзя записать в обход процедуры';
  end if;
  if auth.uid() is null then
    raise exception 'Сначала войдите в систему';
  end if;
  new.actor_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create trigger history_guard
before insert or update or delete on public.status_history
for each row execute function public.guard_history();

create or replace function public.create_task(
  p_title text,
  p_description text,
  p_object_id uuid,
  p_assignee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  clean_title text := btrim(coalesce(p_title, ''));
  clean_description text := coalesce(btrim(p_description), '');
begin
  if auth.uid() is null then
    raise exception 'Сначала войдите в систему';
  end if;
  if not public.is_manager() then
    raise exception 'Создавать задачи может только постановщик';
  end if;
  if char_length(clean_title) = 0 or char_length(clean_title) > 200 then
    raise exception 'Укажите название задачи';
  end if;
  if char_length(clean_description) > 4000 then
    raise exception 'Описание слишком длинное';
  end if;
  if not exists (select 1 from public.objects where id = p_object_id) then
    raise exception 'Объект не найден';
  end if;

  perform set_config('app.task_write_mode', 'insert', true);
  insert into public.tasks (title, description, object_id, assignee_id, status, author_id)
  values (clean_title, clean_description, p_object_id, p_assignee_id, 'Новая', auth.uid())
  returning id into new_id;

  perform set_config('app.allow_history_write', 'on', true);
  insert into public.status_history (task_id, actor_id, from_status, to_status, comment)
  values (new_id, auth.uid(), null, 'Новая', null);

  return new_id;
end;
$$;

create or replace function public.update_task(
  p_task_id uuid,
  p_title text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text := btrim(coalesce(p_title, ''));
  clean_description text := coalesce(btrim(p_description), '');
begin
  if auth.uid() is null then
    raise exception 'Сначала войдите в систему';
  end if;
  if not public.is_manager() then
    raise exception 'Редактировать задачу может только постановщик';
  end if;
  if char_length(clean_title) = 0 or char_length(clean_title) > 200 then
    raise exception 'Укажите название задачи';
  end if;
  if char_length(clean_description) > 4000 then
    raise exception 'Описание слишком длинное';
  end if;

  perform 1 from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Задача не найдена';
  end if;

  perform set_config('app.task_write_mode', 'fields', true);
  update public.tasks
  set title = clean_title,
      description = clean_description
  where id = p_task_id;
end;
$$;

create or replace function public.transition_task(
  p_task_id uuid,
  p_to_status text,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_task public.tasks%rowtype;
  allowed boolean := false;
  clean_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Сначала войдите в систему';
  end if;

  select * into current_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Задача не найдена';
  end if;

  if not public.is_manager() and current_task.assignee_id <> auth.uid() then
    raise exception 'Задача не найдена';
  end if;

  if current_task.status = 'Новая' and p_to_status = 'В работе' and current_task.assignee_id = auth.uid() then
    allowed := true;
  elsif current_task.status = 'В работе' and p_to_status = 'На проверке' and current_task.assignee_id = auth.uid() then
    allowed := true;
  elsif current_task.status = 'На проверке' and p_to_status = 'Принята' and public.is_manager() then
    allowed := true;
  elsif current_task.status = 'На проверке' and p_to_status = 'На доработке' and public.is_manager() then
    allowed := true;
  elsif current_task.status = 'На доработке' and p_to_status = 'В работе' and current_task.assignee_id = auth.uid() then
    allowed := true;
  end if;

  if not allowed then
    raise exception 'Такой переход статуса запрещён';
  end if;

  if p_to_status = 'На доработке' and clean_comment is null then
    raise exception 'Чтобы вернуть задачу, нужен комментарий';
  end if;
  if clean_comment is not null and char_length(clean_comment) > 2000 then
    raise exception 'Комментарий слишком длинный';
  end if;

  perform set_config('app.task_write_mode', 'status', true);
  update public.tasks
  set status = p_to_status
  where id = current_task.id;

  perform set_config('app.allow_history_write', 'on', true);
  insert into public.status_history (task_id, actor_id, from_status, to_status, comment)
  values (current_task.id, auth.uid(), current_task.status, p_to_status, clean_comment);
end;
$$;

create or replace function public.bootstrap_profile(
  p_id uuid,
  p_full_name text,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Профиль создаёт только сервисный ключ';
  end if;
  if p_role not in ('manager', 'executor') then
    raise exception 'Неизвестная роль';
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'Укажите имя';
  end if;

  perform set_config('app.allow_profile_write', 'on', true);
  insert into public.profiles (id, full_name, role)
  values (p_id, btrim(p_full_name), p_role)
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role;
end;
$$;

revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

revoke all on function public.create_task(text, text, uuid, uuid) from public, anon;
grant execute on function public.create_task(text, text, uuid, uuid) to authenticated;

revoke all on function public.update_task(uuid, text, text) from public, anon;
grant execute on function public.update_task(uuid, text, text) to authenticated;

revoke all on function public.transition_task(uuid, text, text) from public, anon;
grant execute on function public.transition_task(uuid, text, text) to authenticated;

revoke all on function public.bootstrap_profile(uuid, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_profile(uuid, text, text) to service_role;

revoke all on function public.guard_profiles() from public, anon, authenticated;
revoke all on function public.guard_objects() from public, anon, authenticated;
revoke all on function public.guard_tasks() from public, anon, authenticated;
revoke all on function public.guard_history() from public, anon, authenticated;

do $$
begin
  execute format('grant execute on function public.guard_profiles() to %I', current_user);
  execute format('grant execute on function public.guard_objects() to %I', current_user);
  execute format('grant execute on function public.guard_tasks() to %I', current_user);
  execute format('grant execute on function public.guard_history() to %I', current_user);
end;
$$;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

revoke all on public.objects from public, anon, authenticated;
grant select, insert, update, delete on public.objects to authenticated;

revoke all on public.tasks from public, anon, authenticated;
grant select on public.tasks to authenticated;

revoke all on public.status_history from public, anon, authenticated;
grant select on public.status_history to authenticated;

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.status_history enable row level security;

create policy profiles_select on public.profiles
for select to authenticated
using (auth.uid() is not null);

create policy objects_select on public.objects
for select to authenticated
using (
  public.is_manager()
  or exists (
    select 1
    from public.tasks t
    where t.object_id = objects.id
      and t.assignee_id = auth.uid()
  )
);

create policy objects_insert on public.objects
for insert to authenticated
with check (public.is_manager());

create policy objects_update on public.objects
for update to authenticated
using (public.is_manager())
with check (public.is_manager());

create policy objects_delete on public.objects
for delete to authenticated
using (public.is_manager());

create policy tasks_select on public.tasks
for select to authenticated
using (public.is_manager() or assignee_id = auth.uid());

create policy history_select on public.status_history
for select to authenticated
using (
  public.is_manager()
  or exists (
    select 1
    from public.tasks t
    where t.id = status_history.task_id
      and t.assignee_id = auth.uid()
  )
);
