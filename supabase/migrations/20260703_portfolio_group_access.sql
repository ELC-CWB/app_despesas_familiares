-- Allow group members to view the group admin's investment operations (read-only).
-- Write operations (INSERT/UPDATE/DELETE) remain restricted to own profile_id via
-- the existing "InvOperations: own" policy.

create policy "InvOperations: group members view admin"
  on public.investment_operations for select
  using (
    profile_id = (
      select ig.created_by
      from public.investment_groups ig
      where ig.id = public.get_my_investment_group_id()
    )
  );
