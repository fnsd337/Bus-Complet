create extension if not exists pgcrypto;

create table public.rooms (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  current_round integer not null default 0,
  settings jsonb not null default '{"round_count":5,"duration":60,"letter_mode":"random","categories":["boy","girl","object","animal","plant","country"],"difficult_enabled":true,"selected_letter":null}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.players (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24), avatar text not null default '🦊',
  is_ready boolean not null default false, is_connected boolean not null default true, last_seen timestamptz not null default now(),
  total_score integer not null default 0, round_score integer not null default 0, joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create table public.rounds (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
  number integer not null, letter text not null, status text not null default 'active' check (status in ('active','review','completed')),
  started_at timestamptz not null default now(), ends_at timestamptz not null, duration_seconds integer not null,
  unique (room_id, number)
);
create table public.answers (
  id uuid primary key default gen_random_uuid(), round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  answer_values jsonb not null default '{}'::jsonb, scores jsonb not null default '{}'::jsonb,
  overrides jsonb not null default '{}'::jsonb, total_points integer not null default 0, locked_at timestamptz,
  unique (round_id, player_id)
);
create table public.answer_votes (
  id uuid primary key default gen_random_uuid(), round_id uuid not null references public.rounds(id) on delete cascade,
  answer_player_id uuid not null references public.players(id) on delete cascade,
  category text not null check (category in ('boy','girl','object','animal','plant','country')),
  voter_id uuid not null references public.players(id) on delete cascade, accepted boolean not null,
  created_at timestamptz not null default now(), unique (round_id, answer_player_id, category, voter_id)
);
create index players_room_idx on public.players(room_id);
create index rounds_room_idx on public.rounds(room_id, number desc);
create index answers_round_idx on public.answers(round_id);

create or replace function public.normalize_arabic(p_value text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(regexp_replace(translate(lower(coalesce(p_value,'')), 'أإآٱى', 'ااااي'), '[ًٌٍَُِّْٰـ]', '', 'g'), '[[:space:][:punct:]،؛؟!]+', '', 'g');
$$;
create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.players p where p.room_id=p_room_id and p.user_id=auth.uid());
$$;
create or replace function public.is_room_host(p_room_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.rooms r where r.id=p_room_id and r.host_id=auth.uid());
$$;

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.answers enable row level security;
alter table public.answer_votes enable row level security;
create policy "members read room" on public.rooms for select to authenticated using (public.is_room_member(id));
create policy "members read players" on public.players for select to authenticated using (public.is_room_member(room_id));
create policy "members read rounds" on public.rounds for select to authenticated using (public.is_room_member(room_id));
create policy "members read answers" on public.answers for select to authenticated using (
  exists (select 1 from public.rounds r where r.id=round_id and public.is_room_member(r.room_id))
);
create policy "members read votes" on public.answer_votes for select to authenticated using (
  exists (select 1 from public.rounds r where r.id=round_id and public.is_room_member(r.room_id))
);
grant select on public.rooms, public.players, public.rounds, public.answers, public.answer_votes to authenticated;
revoke insert, update, delete on public.rooms, public.players, public.rounds, public.answers, public.answer_votes from anon, authenticated;

create or replace function public.pick_game_letter(p_settings jsonb)
returns text language plpgsql volatile as $$
declare
  letters text[] := array['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];
  hard text[] := array['ث','خ','ذ','ض','ظ','غ','ق'];
  picked text;
begin
  if p_settings->>'letter_mode'='host' and nullif(p_settings->>'selected_letter','') is not null then return p_settings->>'selected_letter'; end if;
  if not coalesce((p_settings->>'difficult_enabled')::boolean,true) then
    letters := array(select letter from unnest(letters) as candidate(letter) where letter <> all(hard));
  end if;
  select letter into picked from unnest(letters) as candidate(letter) order by random() limit 1;
  return picked;
end;
$$;

create or replace function public.create_room(p_name text, p_avatar text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room_row public.rooms; room_code text; clean_name text := left(trim(coalesce(p_name,'')),24);
begin
  if auth.uid() is null then raise exception 'يلزم بدء جلسة لاعب.'; end if;
  if char_length(clean_name)<1 then raise exception 'اكتب اسمًا من فضلك.'; end if;
  room_code := upper(substr(md5(random()::text || clock_timestamp()::text),1,6));
  while exists(select 1 from public.rooms where code=room_code) loop room_code := upper(substr(md5(random()::text || clock_timestamp()::text),1,6)); end loop;
  insert into public.rooms(code,host_id) values(room_code,auth.uid()) returning * into room_row;
  insert into public.players(room_id,user_id,display_name,avatar,is_ready) values(room_row.id,auth.uid(),clean_name,coalesce(nullif(p_avatar,''),'🦊'),true);
  return jsonb_build_object('room_id',room_row.id,'code',room_row.code);
end;
$$;

create or replace function public.join_room(p_code text,p_name text,p_avatar text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room_row public.rooms; clean_name text := left(trim(coalesce(p_name,'')),24); player_count integer;
begin
  if auth.uid() is null then raise exception 'يلزم بدء جلسة لاعب.'; end if;
  if char_length(clean_name)<1 then raise exception 'اكتب اسمًا من فضلك.'; end if;
  select * into room_row from public.rooms where code=upper(trim(p_code)) for update;
  if not found then raise exception 'رمز الغرفة غير صحيح.'; end if;
  if room_row.status<>'lobby' and not exists(select 1 from public.players where room_id=room_row.id and user_id=auth.uid()) then raise exception 'بدأت المباراة بالفعل ولا يمكن الانضمام الآن.'; end if;
  select count(*) into player_count from public.players where room_id=room_row.id;
  if player_count>=10 and not exists(select 1 from public.players where room_id=room_row.id and user_id=auth.uid()) then raise exception 'الغرفة مكتملة (١٠ لاعبين).'; end if;
  insert into public.players(room_id,user_id,display_name,avatar,is_connected,last_seen) values(room_row.id,auth.uid(),clean_name,coalesce(nullif(p_avatar,''),'🦊'),true,now())
    on conflict(room_id,user_id) do update set display_name=excluded.display_name,avatar=excluded.avatar,is_connected=true,last_seen=now();
  return jsonb_build_object('room_id',room_row.id,'code',room_row.code);
end;
$$;

create or replace function public.toggle_ready(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  update public.players set is_ready=not is_ready,is_connected=true,last_seen=now() where room_id=p_room_id and user_id=auth.uid() and exists(select 1 from public.rooms where id=p_room_id and status='lobby');
  if not found then raise exception 'تعذر تحديث حالة الاستعداد.'; end if;
end;
$$;

create or replace function public.update_room_settings(p_room_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare categories_count integer; unique_categories_count integer; invalid_categories_count integer;
begin
  if not public.is_room_host(p_room_id) then raise exception 'المضيف وحده يغيّر الإعدادات.'; end if;
  if jsonb_typeof(p_settings->'round_count') is distinct from 'number' then raise exception 'عدد الجولات من ١ إلى ١٠.'; end if;
  if (p_settings->>'round_count')::numeric not between 1 and 10 or (p_settings->>'round_count')::numeric<>trunc((p_settings->>'round_count')::numeric) then raise exception 'عدد الجولات من ١ إلى ١٠.'; end if;
  if jsonb_typeof(p_settings->'duration') is distinct from 'number' then raise exception 'مدة الجولة غير مدعومة.'; end if;
  if (p_settings->>'duration')::numeric not in (30,60,90,120) then raise exception 'مدة الجولة غير مدعومة.'; end if;
  if coalesce(p_settings->>'letter_mode','') not in ('random','host') then raise exception 'طريقة اختيار الحرف غير مدعومة.'; end if;
  if jsonb_typeof(p_settings->'difficult_enabled') is distinct from 'boolean' then raise exception 'إعداد الحروف الصعبة غير صالح.'; end if;
  if jsonb_typeof(p_settings->'categories') is distinct from 'array' then raise exception 'قائمة الفئات غير صالحة.'; end if;
  select count(*),count(distinct category),count(*) filter(where category not in ('boy','girl','object','animal','plant','country'))
    into categories_count,unique_categories_count,invalid_categories_count
    from jsonb_array_elements_text(p_settings->'categories') as category_value(category);
  if categories_count<1 or categories_count>6 or categories_count<>unique_categories_count or invalid_categories_count>0 then raise exception 'اختر فئات صالحة من دون تكرار.'; end if;
  if p_settings->>'letter_mode'='host' and coalesce(p_settings->>'selected_letter','') not in ('ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي') then raise exception 'اختر حرفًا عربيًا صالحًا.'; end if;
  update public.rooms set settings=settings || p_settings where id=p_room_id and status='lobby';
  if not found then raise exception 'لا يمكن تعديل الإعدادات بعد بدء المباراة.'; end if;
end;
$$;

create or replace function public.start_match(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare room_row public.rooms; player_count integer;
begin
  select * into room_row from public.rooms where id=p_room_id for update;
  if not found or room_row.host_id<>auth.uid() then raise exception 'المضيف وحده يبدأ المباراة.'; end if;
  select count(*) into player_count from public.players where room_id=p_room_id;
  if player_count<2 then raise exception 'تحتاج الغرفة لاعبين على الأقل.'; end if;
  if exists(select 1 from public.players where room_id=p_room_id and not is_ready) then raise exception 'بانتظار استعداد جميع اللاعبين.'; end if;
  update public.players set total_score=0,round_score=0 where room_id=p_room_id;
  update public.rooms set status='playing',current_round=1 where id=p_room_id;
  insert into public.rounds(room_id,number,letter,ends_at,duration_seconds) values(p_room_id,1,public.pick_game_letter(room_row.settings),now()+make_interval(secs=>(room_row.settings->>'duration')::integer),(room_row.settings->>'duration')::integer);
end;
$$;

create or replace function public.save_answers(p_room_id uuid,p_values jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare round_row public.rounds; player_row public.players; safe_values jsonb;
begin
  select * into player_row from public.players where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'لم يتم العثور على لاعبك في الغرفة.'; end if;
  select * into round_row from public.rounds where room_id=p_room_id and number=(select current_round from public.rooms where id=p_room_id) for update;
  if round_row.status<>'active' or now()>=round_row.ends_at then raise exception 'انتهى وقت الإجابة.'; end if;
  safe_values := jsonb_build_object('boy',left(coalesce(p_values->>'boy',''),80),'girl',left(coalesce(p_values->>'girl',''),80),
    'object',left(coalesce(p_values->>'object',''),80),'animal',left(coalesce(p_values->>'animal',''),80),
    'plant',left(coalesce(p_values->>'plant',''),80),'country',left(coalesce(p_values->>'country',''),80));
  insert into public.answers(round_id,player_id,answer_values) values(round_row.id,player_row.id,safe_values)
   on conflict(round_id,player_id) do update set answer_values=excluded.answer_values where public.answers.locked_at is null;
  if not found then raise exception 'تم تثبيت إجاباتك ولا يمكن تعديلها.'; end if;
end;
$$;

create or replace function public.recalculate_round_scores(p_round_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  round_row public.rounds; room_row public.rooms; answer_row public.answers; category text;
  normalized_value text; override_value text; is_valid boolean; duplicate_count integer; points integer;
begin
  select * into round_row from public.rounds where id=p_round_id;
  select * into room_row from public.rooms where id=round_row.room_id;
  update public.answers set scores='{}'::jsonb,total_points=0 where round_id=p_round_id;
  for category in select jsonb_array_elements_text(room_row.settings->'categories') loop
    for answer_row in select * from public.answers where round_id=p_round_id loop
      normalized_value := public.normalize_arabic(answer_row.answer_values->>category);
      override_value := answer_row.overrides->>category;
      is_valid := case when override_value is not null then override_value='true'
        else normalized_value<>'' and left(normalized_value,length(public.normalize_arabic(round_row.letter)))=public.normalize_arabic(round_row.letter) end;
      points := 0;
      if is_valid then
        select count(*) into duplicate_count from public.answers other_answer
         where other_answer.round_id=p_round_id and other_answer.id<>answer_row.id
          and public.normalize_arabic(other_answer.answer_values->>category)=normalized_value
          and case when other_answer.overrides ? category then other_answer.overrides->>category='true'
            else public.normalize_arabic(other_answer.answer_values->>category)<>'' and left(public.normalize_arabic(other_answer.answer_values->>category),length(public.normalize_arabic(round_row.letter)))=public.normalize_arabic(round_row.letter) end;
        points := case when duplicate_count=0 then 10 else 5 end;
      end if;
      update public.answers set scores=scores || jsonb_build_object(category,points),total_points=total_points+points where id=answer_row.id;
    end loop;
  end loop;
  update public.players p set total_score=p.total_score+a.total_points-p.round_score,round_score=a.total_points
   from public.answers a where a.round_id=p_round_id and p.id=a.player_id;
end;
$$;

create or replace function public.resolve_round(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare round_row public.rounds; players_count integer; locked_count integer;
begin
  if not public.is_room_member(p_room_id) then raise exception 'لست عضوًا في هذه الغرفة.'; end if;
  select * into round_row from public.rounds where room_id=p_room_id and number=(select current_round from public.rooms where id=p_room_id) for update;
  if not found or round_row.status<>'active' then return; end if;
  select count(*) into players_count from public.players where room_id=p_room_id;
  select count(*) into locked_count from public.answers where round_id=round_row.id and locked_at is not null;
  if now()<round_row.ends_at and locked_count<players_count then return; end if;
  insert into public.answers(round_id,player_id,answer_values,locked_at)
   select round_row.id,p.id,'{}'::jsonb,now() from public.players p where p.room_id=p_room_id
   on conflict(round_id,player_id) do update set locked_at=coalesce(public.answers.locked_at,now());
  update public.rounds set status='review' where id=round_row.id;
  perform public.recalculate_round_scores(round_row.id);
end;
$$;

create or replace function public.finish_round(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare round_row public.rounds; player_row public.players;
begin
  select * into player_row from public.players where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'لم يتم العثور على لاعبك في الغرفة.'; end if;
  select * into round_row from public.rounds where room_id=p_room_id and number=(select current_round from public.rooms where id=p_room_id) for update;
  if not found or round_row.status<>'active' then raise exception 'الجولة ليست مفتوحة.'; end if;
  insert into public.answers(round_id,player_id,answer_values,locked_at) values(round_row.id,player_row.id,'{}'::jsonb,now())
   on conflict(round_id,player_id) do update set locked_at=now() where public.answers.locked_at is null;
  perform public.resolve_round(p_room_id);
end;
$$;

create or replace function public.start_next_round(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare room_row public.rooms; next_number integer;
begin
  select * into room_row from public.rooms where id=p_room_id for update;
  if not found or room_row.host_id<>auth.uid() then raise exception 'المضيف وحده ينتقل للجولة التالية.'; end if;
  if room_row.status<>'playing' or not exists(select 1 from public.rounds where room_id=p_room_id and number=room_row.current_round and status='review') then raise exception 'لم تنتهِ مراجعة الجولة بعد.'; end if;
  update public.rounds set status='completed' where room_id=p_room_id and number=room_row.current_round;
  next_number := room_row.current_round+1;
  update public.players set round_score=0 where room_id=p_room_id;
  if next_number>(room_row.settings->>'round_count')::integer then
    update public.rooms set status='finished' where id=p_room_id;
  else
    update public.rooms set current_round=next_number where id=p_room_id;
    insert into public.rounds(room_id,number,letter,ends_at,duration_seconds)
     values(p_room_id,next_number,public.pick_game_letter(room_row.settings),now()+make_interval(secs=>(room_row.settings->>'duration')::integer),(room_row.settings->>'duration')::integer);
  end if;
end;
$$;

create or replace function public.cast_answer_vote(p_round_id uuid,p_answer_player_id uuid,p_category text,p_accepted boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare answer_row public.answers; voter_row public.players; vote_count integer; yes_count integer; needed integer;
begin
  if p_category not in ('boy','girl','object','animal','plant','country') then raise exception 'الفئة غير صالحة.'; end if;
  select * into answer_row from public.answers where round_id=p_round_id and player_id=p_answer_player_id;
  if not found then raise exception 'الإجابة غير موجودة.'; end if;
  select * into voter_row from public.players where room_id=(select room_id from public.rounds where id=p_round_id) and user_id=auth.uid();
  if not found or voter_row.id=p_answer_player_id then raise exception 'لا يمكنك التصويت على إجابتك.'; end if;
  if (select status from public.rounds where id=p_round_id)<>'review' then raise exception 'التصويت متاح أثناء مراجعة الإجابات فقط.'; end if;
  insert into public.answer_votes(round_id,answer_player_id,category,voter_id,accepted) values(p_round_id,p_answer_player_id,p_category,voter_row.id,p_accepted)
   on conflict(round_id,answer_player_id,category,voter_id) do update set accepted=excluded.accepted;
  select count(*),count(*) filter(where accepted) into vote_count,yes_count from public.answer_votes where round_id=p_round_id and answer_player_id=p_answer_player_id and category=p_category;
  select greatest(1,ceil((count(*)-1)*0.6)::integer) into needed from public.players where room_id=(select room_id from public.rounds where id=p_round_id);
  if vote_count>=needed then
    update public.answers set overrides=overrides || jsonb_build_object(p_category,yes_count>vote_count/2.0) where id=answer_row.id;
    perform public.recalculate_round_scores(p_round_id);
  end if;
end;
$$;

create or replace function public.host_set_answer_valid(p_round_id uuid,p_answer_player_id uuid,p_category text,p_valid boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare target_room uuid;
begin
  if p_category not in ('boy','girl','object','animal','plant','country') then raise exception 'الفئة غير صالحة.'; end if;
  select room_id into target_room from public.rounds where id=p_round_id and status='review';
  if target_room is null or not public.is_room_host(target_room) then raise exception 'التصحيح اليدوي متاح للمضيف أثناء المراجعة.'; end if;
  update public.answers set overrides=overrides || jsonb_build_object(p_category,p_valid) where round_id=p_round_id and player_id=p_answer_player_id;
  perform public.recalculate_round_scores(p_round_id);
end;
$$;

create or replace function public.heartbeat_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  update public.players set is_connected=true,last_seen=now() where room_id=p_room_id and user_id=auth.uid();
  if not found then return; end if;
  update public.players set is_connected=false where room_id=p_room_id and last_seen<now()-interval '35 seconds' and is_connected;
  update public.rooms r set host_id=(select p.user_id from public.players p where p.room_id=r.id and p.is_connected order by p.joined_at limit 1)
   where r.id=p_room_id and exists(select 1 from public.players h where h.room_id=r.id and h.user_id=r.host_id and not h.is_connected)
   and exists(select 1 from public.players p where p.room_id=r.id and p.is_connected);
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  update public.players set is_connected=false where room_id=p_room_id and user_id=auth.uid();
  update public.rooms r set host_id=(select p.user_id from public.players p where p.room_id=r.id and p.is_connected order by p.joined_at limit 1)
   where r.id=p_room_id and r.host_id=auth.uid() and exists(select 1 from public.players p where p.room_id=r.id and p.is_connected);
end;
$$;

create or replace function public.server_time()
returns timestamptz language sql stable security definer set search_path = public as $$ select now(); $$;

create or replace function public.restart_match(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare current_status text;
begin
  if not public.is_room_host(p_room_id) then raise exception 'المضيف وحده يعيد المباراة.'; end if;
  select status into current_status from public.rooms where id=p_room_id for update;
  if current_status<>'finished' then raise exception 'يمكن إعادة المباراة بعد اكتمالها فقط.'; end if;
  delete from public.rounds where room_id=p_room_id;
  update public.rooms set status='lobby',current_round=0 where id=p_room_id;
  update public.players set total_score=0,round_score=0,is_ready=(user_id=auth.uid()) where room_id=p_room_id;
end;
$$;

revoke execute on function public.create_room(text,text),public.join_room(text,text,text),public.toggle_ready(uuid),
 public.update_room_settings(uuid,jsonb),public.start_match(uuid),public.save_answers(uuid,jsonb),public.resolve_round(uuid),
 public.finish_round(uuid),public.start_next_round(uuid),public.cast_answer_vote(uuid,uuid,text,boolean),
 public.host_set_answer_valid(uuid,uuid,text,boolean),public.heartbeat_room(uuid),public.leave_room(uuid),public.restart_match(uuid),
 public.is_room_member(uuid),public.is_room_host(uuid),public.server_time()
 from public,anon;
grant execute on function public.create_room(text,text),public.join_room(text,text,text),public.toggle_ready(uuid),
 public.update_room_settings(uuid,jsonb),public.start_match(uuid),public.save_answers(uuid,jsonb),public.resolve_round(uuid),
 public.finish_round(uuid),public.start_next_round(uuid),public.cast_answer_vote(uuid,uuid,text,boolean),
 public.host_set_answer_valid(uuid,uuid,text,boolean),public.heartbeat_room(uuid),public.leave_room(uuid),public.restart_match(uuid),
 public.is_room_member(uuid),public.is_room_host(uuid) to authenticated;
revoke execute on function public.recalculate_round_scores(uuid),public.pick_game_letter(jsonb) from public,anon;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.answers;
alter publication supabase_realtime add table public.answer_votes;
