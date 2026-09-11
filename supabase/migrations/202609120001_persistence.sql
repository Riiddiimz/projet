-- Col'inCall persistence extensions
-- Keeps WebSocket IDs independent from Supabase UUID primary keys.

alter table public.users
  add column if not exists legacy_id text,
  add column if not exists description text not null default '';

create unique index if not exists idx_users_legacy_id
  on public.users (legacy_id)
  where legacy_id is not null;

create unique index if not exists idx_users_username_lower
  on public.users (lower(username));

alter table public.rooms
  add column if not exists legacy_id text;

create unique index if not exists idx_rooms_legacy_id
  on public.rooms (legacy_id)
  where legacy_id is not null;

create index if not exists idx_messages_room_created
  on public.messages (room_id, created_at);

create index if not exists idx_room_visits_user_visited
  on public.room_visits (user_id, visited_at desc);

create index if not exists idx_reports_status_created
  on public.reports (status, created_at desc);
