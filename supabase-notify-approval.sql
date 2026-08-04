-- Emails the Sangh admin when their dr_profiles.status flips to 'approved'
-- (the field that actually unlocks login — see checkProfileAccess() in js/auth.js).
-- Uses the same shared Cloudflare Worker email relay already used by
-- sportbook's register_player_and_send_otp (telegram-notify.unigoods2026.workers.dev,
-- action:"sendEmail") — no new API key/secret needed.

create or replace function dr_notify_approval() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if NEW.status = 'approved' and OLD.status is distinct from 'approved' then
    select email into v_email from auth.users where id = NEW.id;
    if v_email is not null then
      perform net.http_post(
        url := 'https://telegram-notify.unigoods2026.workers.dev/',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object(
          'action', 'sendEmail',
          'to', v_email,
          'fromName', 'derasarboli',
          'subject', 'Your Derasar Boli Sangh registration is approved',
          'html', '<p>Namaste ' || coalesce(NEW.full_name, '') || ',</p>'
            || '<p>Your Sangh registration on <b>Derasar Boli</b> has been approved. You can now log in and start using the app:</p>'
            || '<p><a href="https://derasar-boli.anyapps.in">https://derasar-boli.anyapps.in</a></p>'
            || '<p style="font-size:13px;color:#666;">Questions? Contact vkv-coder.support@gmail.com</p>'
        )
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists dr_profiles_notify_approval on dr_profiles;
create trigger dr_profiles_notify_approval
after update on dr_profiles
for each row execute function dr_notify_approval();
