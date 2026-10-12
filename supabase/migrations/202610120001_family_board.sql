-- Run the complete file once in a new Supabase project's SQL Editor.
-- Safe to re-run: it preserves existing artworks and light states.
begin;
create table if not exists public.family_lights (
  id smallint primary key check (id between 1 and 3),
  is_on boolean not null default false,
  revision integer not null default 0
);
insert into public.family_lights(id) values (1),(2),(3) on conflict do nothing;
create table if not exists public.family_artworks (
  id uuid primary key,
  author_id uuid not null references auth.users(id),
  kind text not null check (kind in ('stroke','sticker')),
  payload jsonb not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  moderated_at timestamptz
);
alter table public.family_artworks add column if not exists moderated_at timestamptz;
create table if not exists public.family_operations (
  seq bigint generated always as identity primary key,
  id uuid not null unique,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('create','move','remove','light')),
  artwork_id uuid references public.family_artworks(id),
  light_id smallint references public.family_lights(id),
  before_payload jsonb,
  before_deleted_at timestamptz,
  before_on boolean,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists family_operations_actor_seq on public.family_operations(actor_id, seq desc);
create index if not exists family_operations_target on public.family_operations(artwork_id, seq desc);
create index if not exists family_artworks_live on public.family_artworks(created_at) where deleted_at is null;
alter table public.family_lights enable row level security;
alter table public.family_artworks enable row level security;
alter table public.family_operations enable row level security;
revoke all on public.family_lights, public.family_artworks, public.family_operations from anon, authenticated;
grant select on public.family_lights, public.family_artworks, public.family_operations to authenticated;
drop policy if exists family_read_lights on public.family_lights;
create policy family_read_lights on public.family_lights for select to authenticated using (true);
-- Include tombstones in SELECT permissions so soft-deletion UPDATE events reach subscribers.
drop policy if exists family_read_artworks on public.family_artworks;
create policy family_read_artworks on public.family_artworks for select to authenticated using (true);
drop policy if exists family_read_own_operations on public.family_operations;
create policy family_read_own_operations on public.family_operations for select to authenticated using (actor_id = (select auth.uid()));

create or replace function public.family_valid_payload(p_kind text, p jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare point jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if p_kind = 'stroke' then
    if (p - array['color','width','points']) <> '{}'::jsonb
       or not (p ?& array['color','width','points'])
       or not (p->>'color' = any(array['#62635e','#b78376','#b7a16d','#799481','#8297ae']))
       or jsonb_typeof(p->'width') <> 'number' or (p->>'width')::numeric not between 2 and 16
       or jsonb_typeof(p->'points') <> 'array' then return false; end if;
    if jsonb_array_length(p->'points') not between 1 and 3000 then return false; end if;
    for point in select value from jsonb_array_elements(p->'points') loop
      if jsonb_typeof(point) <> 'object' or not (point ?& array['x','y']) or (point - array['x','y']) <> '{}'::jsonb
        or jsonb_typeof(point->'x') <> 'number' or jsonb_typeof(point->'y') <> 'number'
        or (point->>'x')::numeric not between 0 and 1000 or (point->>'y')::numeric not between 0 and 700 then return false; end if;
    end loop;
    return true;
  elsif p_kind = 'sticker' then
    if (p - array['x','y','content','image']) <> '{}'::jsonb or not (p ?& array['x','y','content','image'])
      or jsonb_typeof(p->'x') <> 'number' or jsonb_typeof(p->'y') <> 'number'
      or (p->>'x')::numeric not between 0 and 1000 or (p->>'y')::numeric not between 0 and 700
      or jsonb_typeof(p->'image') <> 'boolean' or jsonb_typeof(p->'content') <> 'string' then return false; end if;
    if (p->>'image')::boolean then
      return (p->>'content') ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.png$';
    end if;
    return p->>'content' = any(array['✿','☾','♡','✦','☁','🌿']);
  end if;
  return false;
exception when others then return false;
end $$;

create or replace function public.family_mutate(
  p_action text, p_op_id uuid,
  p_id uuid default null, p_kind text default null, p_payload jsonb default null,
  p_revision integer default null, p_light smallint default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  art public.family_artworks;
  lamp public.family_lights;
  op public.family_operations;
begin
  if actor is null then raise exception 'not_authenticated'; end if;
  -- One small family board: serialize short mutations for limits, idempotency and safe undo.
  perform pg_advisory_xact_lock(37191, 1);
  if exists(select 1 from public.family_operations where id = p_op_id and actor_id = actor) then return; end if;
  if (select count(*) from public.family_operations where actor_id = actor and created_at > now() - interval '1 minute') >= 60
    or (select count(*) from public.family_operations where actor_id = actor and created_at > now() - interval '1 day') >= 5000 then raise exception 'rate_limit'; end if;
  if p_action = 'light' then
    select * into lamp from public.family_lights where id = p_light for update;
    if not found then raise exception 'invalid_light'; end if;
    update public.family_lights set is_on = not is_on, revision = revision + 1 where id = p_light;
    insert into public.family_operations(id,actor_id,action,light_id,before_on) values(p_op_id,actor,'light',p_light,lamp.is_on);
  elsif p_action = 'create' then
    if p_id is null or not public.family_valid_payload(p_kind,p_payload) then raise exception 'invalid_payload'; end if;
    if (select count(*) from public.family_artworks where deleted_at is null) >= 500 then raise exception 'board_limit'; end if;
    if p_kind = 'sticker' and (p_payload->>'image')::boolean then
      if split_part(p_payload->>'content','/',1) <> actor::text or not exists (
        select 1 from storage.objects where bucket_id = 'family-images' and name = p_payload->>'content' and owner_id = actor::text
      ) then raise exception 'invalid_image'; end if;
    end if;
    insert into public.family_artworks(id,author_id,kind,payload) values(p_id,actor,p_kind,p_payload);
    insert into public.family_operations(id,actor_id,action,artwork_id) values(p_op_id,actor,'create',p_id);
  elsif p_action in ('move','remove') then
    select * into art from public.family_artworks where id = p_id for update;
    if not found or art.author_id <> actor then raise exception 'not_owner'; end if;
    if art.moderated_at is not null then raise exception 'not_owner'; end if;
    if art.deleted_at is not null or art.revision is distinct from p_revision then raise exception 'conflict'; end if;
    if p_action = 'move' then
      if art.kind <> 'sticker' or p_payload is null or not (p_payload ?& array['x','y']) or (p_payload - array['x','y']) <> '{}'::jsonb
        or not public.family_valid_payload('sticker',art.payload || p_payload) then raise exception 'invalid_payload'; end if;
      update public.family_artworks set payload = payload || p_payload, revision = revision + 1 where id = p_id;
    else
      update public.family_artworks set deleted_at = now(), revision = revision + 1 where id = p_id;
    end if;
    insert into public.family_operations(id,actor_id,action,artwork_id,before_payload,before_deleted_at)
      values(p_op_id,actor,p_action,p_id,art.payload,art.deleted_at);
  elsif p_action = 'undo' then
    select * into op from public.family_operations where actor_id = actor and undone_at is null order by seq desc limit 1 for update;
    if not found then return; end if;
    -- Never restore over another person's newer operation on the same light or artwork.
    if exists(select 1 from public.family_operations later where later.seq > op.seq and later.undone_at is null
      and ((op.artwork_id is not null and later.artwork_id = op.artwork_id) or (op.light_id is not null and later.light_id = op.light_id))) then raise exception 'undo_conflict'; end if;
    if op.artwork_id is not null and exists(select 1 from public.family_artworks where id = op.artwork_id and moderated_at is not null) then raise exception 'undo_conflict'; end if;
    if op.action = 'light' then
      update public.family_lights set is_on = op.before_on, revision = revision + 1 where id = op.light_id;
    elsif op.action = 'create' then
      update public.family_artworks set deleted_at = now(), revision = revision + 1 where id = op.artwork_id and author_id = actor;
    else
      if op.action = 'remove' and (select count(*) from public.family_artworks where deleted_at is null) >= 500 then raise exception 'board_limit'; end if;
      update public.family_artworks set payload = op.before_payload, deleted_at = op.before_deleted_at, revision = revision + 1 where id = op.artwork_id and author_id = actor;
    end if;
    update public.family_operations set undone_at = now() where id = op.id;
  else raise exception 'invalid_action';
  end if;
end $$;
revoke all on function public.family_mutate(text,uuid,uuid,text,jsonb,integer,smallint) from public, anon;
grant execute on function public.family_mutate(text,uuid,uuid,text,jsonb,integer,smallint) to authenticated;
revoke all on function public.family_valid_payload(text,jsonb) from public, anon, authenticated;

-- Private images. The service enforces bucket size and content-type restrictions.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('family-images','family-images',false,1048576,array['image/png'])
on conflict(id) do update set public=false,file_size_limit=1048576,allowed_mime_types=array['image/png'];
create or replace function public.family_upload_allowed(path text)
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and split_part(path,'/',1) = auth.uid()::text
   and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.png$'
   and (select count(*) from storage.objects where bucket_id='family-images' and owner_id=auth.uid()::text) < 20
   and (select count(*) from storage.objects where bucket_id='family-images') < 200;
$$;
revoke all on function public.family_upload_allowed(text) from public, anon;
grant execute on function public.family_upload_allowed(text) to authenticated;
drop policy if exists family_image_upload on storage.objects;
create policy family_image_upload on storage.objects for insert to authenticated
 with check (bucket_id = 'family-images' and public.family_upload_allowed(name));
drop policy if exists family_image_read on storage.objects;
create policy family_image_read on storage.objects for select to authenticated using (
 bucket_id = 'family-images' and (owner_id = (select auth.uid())::text or exists (
   select 1 from public.family_artworks a where a.deleted_at is null and a.kind = 'sticker' and a.payload->>'content' = name and a.payload->>'image' = 'true'
 ))
);
-- No UPDATE or DELETE image permission for visitors. SQL Editor admins can moderate and clean up.
-- URLs last 1 hour; removed content disappears from the board immediately, but an already issued URL can live until expiry.
do $$
declare tab text;
begin
 foreach tab in array array['family_lights','family_artworks','family_operations'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tab) then
     execute format('alter publication supabase_realtime add table public.%I',tab);
   end if;
 end loop;
end $$;
commit;
