-- Allow room hosts to add their own answer categories and track friendly room records.

alter table public.players add column if not exists matches_played integer not null default 0;
alter table public.players add column if not exists wins integer not null default 0;
alter table public.players add column if not exists win_streak integer not null default 0;
alter table public.players add column if not exists best_win_streak integer not null default 0;
alter table public.players add column if not exists bus_completes integer not null default 0;
alter table public.players add column if not exists fastest_bus_ms integer;
alter table public.answers add column if not exists submitted_at timestamptz;

alter table public.rooms alter column settings set default
  '{"round_count":5,"letter_mode":"random","categories":["boy","girl","object","animal","plant","country"],"custom_categories":[],"difficult_enabled":true,"selected_letter":null}'::jsonb;

alter table public.answer_votes drop constraint if exists answer_votes_category_check;
alter table public.answer_votes add constraint answer_votes_category_check
  check (category in ('boy','girl','object','animal','plant','country') or category ~ '^custom_[0-9a-f]{8}$');

create or replace function public.update_room_settings(p_room_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  categories_count integer;
  unique_categories_count integer;
  invalid_categories_count integer;
  custom_count integer;
  unique_custom_ids integer;
  unique_custom_labels integer;
  invalid_custom_count integer;
begin
  if not public.is_room_host(p_room_id) then raise exception 'المضيف وحده يغيّر الإعدادات.'; end if;
  if jsonb_typeof(p_settings->'round_count') is distinct from 'number'
    or (p_settings->>'round_count')::numeric not between 1 and 10
    or (p_settings->>'round_count')::numeric<>trunc((p_settings->>'round_count')::numeric) then
    raise exception 'عدد الجولات من ١ إلى ١٠.';
  end if;
  if jsonb_typeof(p_settings->'difficult_enabled') is distinct from 'boolean' then raise exception 'إعداد الحروف الصعبة غير صالح.'; end if;
  if jsonb_typeof(p_settings->'categories') is distinct from 'array' then raise exception 'قائمة الفئات غير صالحة.'; end if;
  if p_settings ? 'custom_categories' and jsonb_typeof(p_settings->'custom_categories') is distinct from 'array' then
    raise exception 'قائمة الفئات المخصصة غير صالحة.';
  end if;

  select count(*),count(distinct selected.category),
    count(*) filter(where selected.category is null
      or (selected.category not in ('boy','girl','object','animal','plant','country')
        and not exists (
          select 1 from jsonb_array_elements(coalesce(p_settings->'custom_categories','[]'::jsonb)) as custom_item(value)
          where custom_item.value->>'id'=selected.category
        )))
    into categories_count,unique_categories_count,invalid_categories_count
    from jsonb_array_elements_text(p_settings->'categories') as selected(category);
  if categories_count<1 or categories_count>10 or categories_count<>unique_categories_count or invalid_categories_count>0 then
    raise exception 'اختار من فئة واحدة إلى ١٠ فئات من دون تكرار.';
  end if;

  select count(*),count(distinct item.value->>'id'),count(distinct lower(item.value->>'label')),
    count(*) filter(where coalesce(item.value->>'id','') !~ '^custom_[0-9a-f]{8}$'
      or char_length(trim(coalesce(item.value->>'label',''))) not between 2 and 20)
    into custom_count,unique_custom_ids,unique_custom_labels,invalid_custom_count
    from jsonb_array_elements(coalesce(p_settings->'custom_categories','[]'::jsonb)) as item(value);
  if custom_count>20 or custom_count<>unique_custom_ids or custom_count<>unique_custom_labels or invalid_custom_count>0 then
    raise exception 'أسماء الفئات المخصصة يجب أن تكون فريدة ومن حرفين إلى ٢٠ حرفًا.';
  end if;

  update public.rooms set settings=settings || p_settings where id=p_room_id and status='lobby';
  if not found then raise exception 'لا يمكن تعديل الإعدادات بعد بدء المباراة.'; end if;
end;
$$;

create or replace function public.save_answers(p_room_id uuid,p_values jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  round_row public.rounds;
  room_row public.rooms;
  player_row public.players;
  safe_values jsonb := '{}'::jsonb;
  category text;
begin
  select * into player_row from public.players where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'لم يتم العثور على لاعبك في الغرفة.'; end if;
  select * into room_row from public.rooms where id=p_room_id;
  select * into round_row from public.rounds where room_id=p_room_id and number=room_row.current_round for update;
  if not found or round_row.status<>'active' then raise exception 'الجولة اتقفلت بعد إعلان أتوبيس كومبليت.'; end if;

  for category in select jsonb_array_elements_text(room_row.settings->'categories') loop
    safe_values := safe_values || jsonb_build_object(category,left(coalesce(p_values->>category,''),80));
  end loop;
  insert into public.answers(round_id,player_id,answer_values) values(round_row.id,player_row.id,safe_values)
    on conflict(round_id,player_id) do update set answer_values=excluded.answer_values
    where public.answers.locked_at is null;
  if not found then raise exception 'تم تثبيت إجاباتك ولا يمكن تعديلها.'; end if;
end;
$$;

create or replace function public.pick_round_letter(p_room_id uuid,p_letter text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare round_row public.rounds; room_row public.rooms; picker_connected boolean;
begin
  if coalesce(p_letter,'') not in ('ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي') then
    raise exception 'اختار حرفًا عربيًا من القائمة.';
  end if;
  select * into room_row from public.rooms where id=p_room_id;
  if not found then raise exception 'الغرفة غير موجودة.'; end if;
  select * into round_row from public.rounds where room_id=p_room_id and number=room_row.current_round for update;
  if not found or round_row.status<>'choosing' then raise exception 'اختيار الحرف غير متاح الآن.'; end if;
  select is_connected into picker_connected from public.players where room_id=p_room_id and user_id=round_row.picker_user_id;
  if round_row.picker_user_id<>auth.uid() and not (room_row.host_id=auth.uid() and not coalesce(picker_connected,false)) then
    raise exception 'استنوا دور اللاعب المسؤول عن اختيار الحرف.';
  end if;
  update public.rounds set letter=p_letter,status='active',started_at=clock_timestamp() where id=round_row.id;
end;
$$;

create or replace function public.finish_round(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  round_row public.rounds;
  player_row public.players;
  room_row public.rooms;
  submit_time timestamptz := clock_timestamp();
  elapsed_ms integer;
begin
  select * into player_row from public.players where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'لم يتم العثور على لاعبك في الغرفة.'; end if;
  select * into room_row from public.rooms where id=p_room_id;
  select * into round_row from public.rounds where room_id=p_room_id and number=room_row.current_round for update;
  if not found or round_row.status<>'active' then raise exception 'الجولة ليست مفتوحة.'; end if;

  if exists(
    select 1 from jsonb_array_elements_text(room_row.settings->'categories') as selected(category)
    where not exists(
      select 1 from public.answers answer_row
      where answer_row.round_id=round_row.id and answer_row.player_id=player_row.id
        and nullif(trim(answer_row.answer_values->>selected.category),'') is not null
        and left(public.normalize_arabic(answer_row.answer_values->>selected.category),length(public.normalize_arabic(round_row.letter)))=public.normalize_arabic(round_row.letter)
    )
  ) then raise exception 'املأ كل الخانات وتأكد أن كل إجابة تبدأ بحرف الجولة.'; end if;

  insert into public.answers(round_id,player_id,answer_values,locked_at,submitted_at)
    values(round_row.id,player_row.id,'{}'::jsonb,submit_time,submit_time)
    on conflict(round_id,player_id) do update set locked_at=submit_time,submitted_at=submit_time
    where public.answers.locked_at is null;
  if not found then raise exception 'تم تثبيت إجاباتك ولا يمكن تعديلها.'; end if;

  elapsed_ms := greatest(0,floor(extract(epoch from (submit_time-round_row.started_at))*1000)::integer);
  update public.players set bus_completes=bus_completes+1,
    fastest_bus_ms=case when fastest_bus_ms is null then elapsed_ms else least(fastest_bus_ms,elapsed_ms) end
    where id=player_row.id;

  update public.answers set locked_at=coalesce(locked_at,submit_time) where round_id=round_row.id;
  insert into public.answers(round_id,player_id,answer_values,locked_at)
    select round_row.id,p.id,'{}'::jsonb,submit_time from public.players p
    where p.room_id=p_room_id and not exists(select 1 from public.answers a where a.round_id=round_row.id and a.player_id=p.id)
    on conflict(round_id,player_id) do nothing;
  update public.rounds set status='review' where id=round_row.id;
  perform public.recalculate_round_scores(round_row.id);
end;
$$;

create or replace function public.cast_answer_vote(p_round_id uuid,p_answer_player_id uuid,p_category text,p_accepted boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare answer_row public.answers; voter_row public.players; vote_count integer; yes_count integer; needed integer; target_room uuid;
begin
  select room_id into target_room from public.rounds where id=p_round_id and status='review';
  if target_room is null then raise exception 'التصويت متاح أثناء مراجعة الإجابات فقط.'; end if;
  if not public.is_room_member(target_room) then raise exception 'لست عضوًا في هذه الغرفة.'; end if;
  if not exists(select 1 from jsonb_array_elements_text((select settings->'categories' from public.rooms where id=target_room)) selected(category) where selected.category=p_category) then
    raise exception 'الفئة غير صالحة.';
  end if;
  select * into answer_row from public.answers where round_id=p_round_id and player_id=p_answer_player_id;
  if not found then raise exception 'الإجابة غير موجودة.'; end if;
  select * into voter_row from public.players where room_id=target_room and user_id=auth.uid();
  if not found or voter_row.id=p_answer_player_id then raise exception 'لا يمكنك التصويت على إجابتك.'; end if;
  insert into public.answer_votes(round_id,answer_player_id,category,voter_id,accepted)
    values(p_round_id,p_answer_player_id,p_category,voter_row.id,p_accepted)
    on conflict(round_id,answer_player_id,category,voter_id) do update set accepted=excluded.accepted;
  select count(*),count(*) filter(where accepted) into vote_count,yes_count from public.answer_votes
    where round_id=p_round_id and answer_player_id=p_answer_player_id and category=p_category;
  select greatest(1,ceil((count(*)-1)*0.6)::integer) into needed from public.players where room_id=target_room;
  if vote_count>=needed then
    update public.answers set overrides=overrides || jsonb_build_object(p_category,yes_count>vote_count/2.0)
      where id=answer_row.id;
    perform public.recalculate_round_scores(p_round_id);
  end if;
end;
$$;

create or replace function public.host_set_answer_valid(p_round_id uuid,p_answer_player_id uuid,p_category text,p_valid boolean)
returns void language plpgsql security definer set search_path = public, auth as $$
declare target_room uuid;
begin
  select room_id into target_room from public.rounds where id=p_round_id and status='review';
  if target_room is null or not public.is_room_host(target_room) then raise exception 'التصحيح اليدوي متاح للمضيف أثناء المراجعة.'; end if;
  if not exists(select 1 from jsonb_array_elements_text((select settings->'categories' from public.rooms where id=target_room)) selected(category) where selected.category=p_category) then
    raise exception 'الفئة غير صالحة.';
  end if;
  update public.answers set overrides=overrides || jsonb_build_object(p_category,p_valid)
    where round_id=p_round_id and player_id=p_answer_player_id;
  if not found then raise exception 'الإجابة غير موجودة.'; end if;
  perform public.recalculate_round_scores(p_round_id);
end;
$$;

create or replace function public.start_next_round(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  room_row public.rooms;
  next_number integer;
  player_count integer;
  previous_picker uuid;
  previous_position integer;
  next_picker uuid;
  winning_score integer;
begin
  select * into room_row from public.rooms where id=p_room_id for update;
  if not found or room_row.host_id<>auth.uid() then raise exception 'المضيف وحده ينتقل للجولة التالية.'; end if;
  if room_row.status<>'playing' or not exists(select 1 from public.rounds where room_id=p_room_id and number=room_row.current_round and status='review') then
    raise exception 'لم تنتهِ مراجعة الجولة بعد.';
  end if;
  update public.rounds set status='completed' where room_id=p_room_id and number=room_row.current_round;
  next_number := room_row.current_round+1;
  if next_number>(room_row.settings->>'round_count')::integer then
    select max(total_score) into winning_score from public.players where room_id=p_room_id;
    update public.players set matches_played=matches_played+1,
      wins=wins+case when total_score=winning_score then 1 else 0 end,
      win_streak=case when total_score=winning_score then win_streak+1 else 0 end,
      best_win_streak=case when total_score=winning_score then greatest(best_win_streak,win_streak+1) else best_win_streak end
      where room_id=p_room_id;
    update public.rooms set status='finished' where id=p_room_id;
  else
    update public.players set round_score=0 where room_id=p_room_id;
    select picker_user_id into previous_picker from public.rounds where room_id=p_room_id and number=room_row.current_round;
    select count(*) into player_count from public.players where room_id=p_room_id;
    select position into previous_position from (
      select user_id,row_number() over(order by joined_at,id)::integer as position from public.players where room_id=p_room_id
    ) ordered_players where user_id=previous_picker;
    if previous_position is null then previous_position:=0; end if;
    select user_id into next_picker from (
      select user_id,row_number() over(order by joined_at,id)::integer as position from public.players where room_id=p_room_id
    ) ordered_players where position=(previous_position % player_count)+1;
    update public.rooms set current_round=next_number where id=p_room_id;
    insert into public.rounds(room_id,number,letter,status,ends_at,duration_seconds,picker_user_id)
      values(p_room_id,next_number,'ا','choosing',now(),0,next_picker);
  end if;
end;
$$;
