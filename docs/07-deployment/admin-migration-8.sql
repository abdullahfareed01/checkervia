-- Tighten the three helper functions flagged by the live security advisor.
-- Preserve their bodies, signatures and existing execution privileges.
begin;

alter function public.utc_day(timestamptz) set search_path = public;
alter function public.admin_like(text) set search_path = public;
alter function public.admin_has_rooms() set search_path = public;

commit;
