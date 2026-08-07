create or replace function public.notify_line_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.send_line_notification(
    format('New order #%s from %s — %s', new.order_number, left(new.customer_name, 100), new.total)
  );
  return new;
end;
$$;

create trigger trg_orders_notify_line_new_order
  after insert on public.orders
  for each row execute function public.notify_line_new_order();

create or replace function public.notify_line_slip_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.send_line_notification(
    format('Payment slip uploaded for order #%s — please verify', new.order_number)
  );
  return new;
end;
$$;

create trigger trg_orders_notify_line_slip_uploaded
  after update on public.orders
  for each row
  when (old.payment_slip_path is null and new.payment_slip_path is not null)
  execute function public.notify_line_slip_uploaded();

revoke execute on function public.notify_line_new_order() from public, anon, authenticated;
revoke execute on function public.notify_line_slip_uploaded() from public, anon, authenticated;
