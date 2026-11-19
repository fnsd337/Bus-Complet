alter table public.rooms add column if not exists closed_at timestamptz;

create or replace function public.leave_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare active_round_id uuid;
begin
  update public.players set is_connected=false,last_seen=now() where room_id=p_room_id and user_id=auth.uid();
  if not found then return; end if;
  update public.players set is_connected=false
   where room_id=p_room_id and is_connected and last_seen<now()-interval '35 seconds';
  update public.rooms r set host_id=(select p.user_id from public.players p where p.room_id=r.id and p.is_connected order by p.joined_at limit 1)
   where r.id=p_room_id and r.host_id=auth.uid() and exists(select 1 from public.players p where p.room_id=r.id and p.is_connected);
  if not exists(select 1 from public.players p where p.room_id=p_room_id and p.is_connected) then
    select id into active_round_id from public.rounds
      where room_id=p_room_id and number=(select current_round from public.rooms where id=p_room_id) and status='active' for update;
    if active_round_id is not null then
      update public.answers set locked_at=coalesce(locked_at,now()) where round_id=active_round_id;
      insert into public.answers(round_id,player_id,answer_values,locked_at)
        select active_round_id,p.id,'{}'::jsonb,now() from public.players p
        where p.room_id=p_room_id and not exists(select 1 from public.answers a where a.round_id=active_round_id and a.player_id=p.id);
      update public.rounds set status='review' where id=active_round_id;
      perform public.recalculate_round_scores(active_round_id);
    end if;
    update public.rooms set status='finished',closed_at=now() where id=p_room_id;
  end if;
end;
$$;
