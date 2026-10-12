-- Run this file in the existing project's SQL Editor. Installation does not clear anything.
begin;
create or replace function public.family_clear()
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'not_authenticated'; end if;
  perform pg_advisory_xact_lock(37191, 1);
  -- Moderation tombstones prevent older undo operations from restoring cleared artwork.
  update public.family_artworks
  set deleted_at = now(), moderated_at = now(), revision = revision + 1
  where deleted_at is null;
end $$;
revoke all on function public.family_clear() from public, anon;
grant execute on function public.family_clear() to authenticated;
commit;
