-- LINE Notify replacement: LINE Corp shut down the LINE Notify service on
-- 2025-03-31 (https://notify-bot.line.me/closing-announce). This module
-- uses the Messaging API's push endpoint instead
-- (https://developers.line.biz/en/docs/messaging-api/sending-messages/).
--
-- pg_net + Vault is Supabase's own documented pattern for calling an
-- external API from a trigger while keeping the API key encrypted at rest
-- (https://supabase.com/docs/guides/database/vault) -- this keeps the
-- module inside this project's all-migrations architecture, no Edge
-- Function needed.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- The store owner configures these once -- see CLAUDE.md's bootstrap step
-- (create a LINE Official Account + Channel Access Token, then):
--   select vault.create_secret('<channel access token>', 'line_channel_access_token');
--   select vault.create_secret('<the owner''s own LINE user id>', 'line_admin_user_id');
-- Neither secret exists by default -- this function silently no-ops until
-- both are configured, which is the actual on/off switch for this module.
-- branding.config.ts's lineNotify flag has no frontend code to gate, since
-- this module has no UI at all -- see CLAUDE.md's "LINE Notify" section.
create or replace function public.send_line_notification(p_message text)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  v_token   text;
  v_user_id text;
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'line_channel_access_token';
  select decrypted_secret into v_user_id
    from vault.decrypted_secrets where name = 'line_admin_user_id';

  if v_token is null or v_user_id is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.line.me/v2/bot/message/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := jsonb_build_object(
      'to', v_user_id,
      'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_message))
    )
  );
exception
  when others then
    -- A LINE notification failure must never block or roll back whatever
    -- called this function (create_order()/attach_payment_slip(), both
    -- checkout-critical). Swallow everything; log a warning, nothing more.
    raise warning 'send_line_notification failed: %', sqlerrm;
end;
$$;

revoke execute on function public.send_line_notification(text) from public, anon, authenticated;
