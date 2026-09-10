-- ═══════════════════════════════════════════════════════
-- AI Study Assistant — Supabase Database Schema
-- Safe to re-run (uses DROP IF EXISTS before CREATE)
-- ═══════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────
-- 1. User Profiles (extends Supabase auth.users)
-- ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  display_name  text,
  avatar_url    text,
  email         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ───────────────────────────────────────────────────────
-- 2. Conversations
-- ───────────────────────────────────────────────────────
create table if not exists public.conversations (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null,
  pdf_name    text,
  timestamp   text,
  created_at  timestamptz default now()
);

alter table public.conversations enable row level security;

drop policy if exists "Users can view their own conversations" on public.conversations;
create policy "Users can view their own conversations"
  on public.conversations for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own conversations" on public.conversations;
create policy "Users can insert their own conversations"
  on public.conversations for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversations" on public.conversations;
create policy "Users can update their own conversations"
  on public.conversations for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own conversations" on public.conversations;
create policy "Users can delete their own conversations"
  on public.conversations for delete using (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────
-- 3. Messages
-- ───────────────────────────────────────────────────────
create table if not exists public.messages (
  id              text primary key,
  conversation_id text references public.conversations(id) on delete cascade not null,
  user_id         uuid references auth.users(id) on delete cascade not null,
  role            text not null,
  content         text not null,
  type            text,
  quiz_questions  jsonb,
  quiz_answers    jsonb,
  quiz_result     jsonb,
  flashcards      jsonb,
  flashcard_index integer default 0,
  created_at      timestamptz default now()
);

alter table public.messages enable row level security;

drop policy if exists "Users can view their own messages" on public.messages;
create policy "Users can view their own messages"
  on public.messages for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own messages" on public.messages;
create policy "Users can insert their own messages"
  on public.messages for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own messages" on public.messages;
create policy "Users can update their own messages"
  on public.messages for update using (auth.uid() = user_id);

drop policy if exists "Users can delete their own messages" on public.messages;
create policy "Users can delete their own messages"
  on public.messages for delete using (auth.uid() = user_id);


-- ───────────────────────────────────────────────────────
-- 4. Indexes for performance
-- ───────────────────────────────────────────────────────
create index if not exists idx_conversations_user_id on public.conversations(user_id);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_messages_user_id on public.messages(user_id);
