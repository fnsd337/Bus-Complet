-- Rotate the letter picker for each round and enable private, size-limited avatar uploads.
alter table public.rounds add column if not exists picker_user_id uuid references auth.users(id) on delete set null;
alter table public.rounds drop constraint if exists rounds_status_check;
alter table public.rounds add constraint rounds_status_check check (status in ('choosing','active','review','completed'));
alter table public.rooms add column if not exists creator_id uuid references auth.users(id) on delete cascade;
update public.rooms set creator_id=host_id where creator_id is null;
alter table public.rooms alter column creator_id set not null;

alter table public.rooms alter column settings set default
  '{"round_count":5,"categories":["boy","girl","object","animal","plant","country"],"difficult_enabled":true}'::jsonb;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('player-avatars','player-avatars',true,1048576,array['image/webp'])
on conflict (id) do update set public=true,file_size_limit=1048576,allowed_mime_types=array['image/webp'];

drop policy if exists "players upload own avatar" on storage.objects;
create policy "players upload own avatar"
on storage.objects for insert to authenticated
with check (bucket_id='player-avatars' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.create_room(p_name text, p_avatar text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room_row public.rooms; room_code text; clean_name text := left(trim(coalesce(p_name,'')),24);
begin
  if auth.uid() is null then raise exception 'يلزم بدء جلسة لاعب.'; end if;
  if char_length(clean_name)<1 then raise exception 'اكتب اسمًا من فضلك.'; end if;
  room_code := upper(substr(md5(random()::text || clock_timestamp()::text),1,6));
  while exists(select 1 from public.rooms where code=room_code) loop room_code:=upper(substr(md5(random()::text || clock_timestamp()::text),1,6)); end loop;
  insert into public.rooms(code,host_id,creator_id) values(room_code,auth.uid(),auth.uid()) returning * into room_row;
  insert into public.players(room_id,user_id,display_name,avatar,is_ready)
    values(room_row.id,auth.uid(),clean_name,left(coalesce(nullif(p_avatar,''),'🦊'),512),true);
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
  insert into public.players(room_id,user_id,display_name,avatar,is_connected,last_seen)
    values(room_row.id,auth.uid(),clean_name,left(coalesce(nullif(p_avatar,''),'🦊'),512),true,now())
    on conflict(room_id,user_id) do update set display_name=excluded.display_name,avatar=excluded.avatar,is_connected=true,last_seen=now();
  return jsonb_build_object('room_id',room_row.id,'code',room_row.code);
end;
$$;

create or replace function public.update_room_settings(p_room_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare categories_count integer; unique_categories_count integer; invalid_categories_count integer;
begin
  if not public.is_room_host(p_room_id) then raise exception 'المضيف وحده يغيّر الإعدادات.'; end if;
  if jsonb_typeof(p_settings->'round_count') is distinct from 'number' then raise exception 'عدد الجولات من ١ إلى ١٠.'; end if;
  if (p_settings->>'round_count')::numeric not between 1 and 10 or (p_settings->>'round_count')::numeric<>trunc((p_settings->>'round_count')::numeric) then raise exception 'عدد الجولات من ١ إلى ١٠.'; end if;
  if jsonb_typeof(p_settings->'difficult_enabled') is distinct from 'boolean' then raise exception 'إعداد الحروف الصعبة غير صالح.'; end if;
  if jsonb_typeof(p_settings->'categories') is distinct from 'array' then raise exception 'قائمة الفئات غير صالحة.'; end if;
  select count(*),count(distinct category),count(*) filter(where category not in ('boy','girl','object','animal','plant','country'))
    into categories_count,unique_categories_count,invalid_categories_count
    from jsonb_array_elements_text(p_settings->'categories') as category_value(category);
  if categories_count<1 or categories_count>6 or categories_count<>unique_categories_count or invalid_categories_count>0 then raise exception 'اختر فئات صالحة من دون تكرار.'; end if;
  update public.rooms set settings=(settings || p_settings) - 'duration' - 'letter_mode' - 'selected_letter' where id=p_room_id and status='lobby';
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
  insert into public.rounds(room_id,number,letter,status,ends_at,duration_seconds,picker_user_id)
    values(p_room_id,1,'ا','choosing',now(),0,room_row.creator_id);
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
  update public.rounds set letter=p_letter,status='active' where id=round_row.id;
end;
$$;

create or replace function public.save_answers(p_room_id uuid,p_values jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare round_row public.rounds; player_row public.players; safe_values jsonb;
begin
  select * into player_row from public.players where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'لم يتم العثور على لاعبك في الغرفة.'; end if;
  select * into round_row from public.rounds where room_id=p_room_id and number=(select current_round from public.rooms where id=p_room_id) for update;
  if round_row.status<>'active' then raise exception 'الجولة اتقفلت بعد إعلان أتوبيس كومبليت.'; end if;
  safe_values := jsonb_build_object('boy',left(coalesce(p_values->>'boy',''),80),'girl',left(coalesce(p_values->>'girl',''),80),
    'object',left(coalesce(p_values->>'object',''),80),'animal',left(coalesce(p_values->>'animal',''),80),
    'plant',left(coalesce(p_values->>'plant',''),80),'country',left(coalesce(p_values->>'country',''),80));
  insert into public.answers(round_id,player_id,answer_values) values(round_row.id,player_row.id,safe_values)
   on conflict(round_id,player_id) do update set answer_values=excluded.answer_values where public.answers.locked_at is null;
  if not found then raise exception 'تم تثبيت إجاباتك ولا يمكن تعديلها.'; end if;
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
  if locked_count<players_count then return; end if;
  update public.rounds set status='review' where id=round_row.id;
  perform public.recalculate_round_scores(round_row.id);
end;
$$;

create or replace function public.finish_round(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare round_row public.rounds; player_row public.players; room_row public.rooms;
begin
  select * into player_row from public.players where room_id=p_room_id and user_id=auth.uid();
  if not found then raise exception 'لم يتم العثور على لاعبك في الغرفة.'; end if;
  select * into round_row from public.rounds where room_id=p_room_id and number=(select current_round from public.rooms where id=p_room_id) for update;
  if not found or round_row.status<>'active' then raise exception 'الجولة ليست مفتوحة.'; end if;
  select * into room_row from public.rooms where id=p_room_id;
  if exists(
    select 1 from jsonb_array_elements_text(room_row.settings->'categories') as selected(category)
    where not exists(
      select 1 from public.answers a
      where a.round_id=round_row.id and a.player_id=player_row.id
        and nullif(trim(a.answer_values->>selected.category),'') is not null
        and left(public.normalize_arabic(a.answer_values->>selected.category),length(public.normalize_arabic(round_row.letter)))=public.normalize_arabic(round_row.letter)
    )
  ) then raise exception 'املأ كل الخانات وتأكد أن كل إجابة تبدأ بحرف الجولة.'; end if;
  insert into public.answers(round_id,player_id,answer_values,locked_at) values(round_row.id,player_row.id,'{}'::jsonb,now())
    on conflict(round_id,player_id) do update set locked_at=now() where public.answers.locked_at is null;
  insert into public.answers(round_id,player_id,answer_values,locked_at)
    select round_row.id,p.id,'{}'::jsonb,now() from public.players p where p.room_id=p_room_id and p.id<>player_row.id
    on conflict(round_id,player_id) do update set locked_at=coalesce(public.answers.locked_at,now());
  update public.rounds set status='review' where id=round_row.id;
  perform public.recalculate_round_scores(round_row.id);
end;
$$;

create or replace function public.start_next_round(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare room_row public.rooms; next_number integer; player_count integer; previous_picker uuid; previous_position integer; next_picker uuid;
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

revoke execute on function public.pick_round_letter(uuid,text) from public,anon;
grant execute on function public.pick_round_letter(uuid,text) to authenticated;
