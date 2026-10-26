-- The project was created with "automatically expose new tables" off, so new
-- tables get no grants. The server connects as service_role (it bypasses RLS
-- but still needs table privileges). anon and authenticated are deliberately
-- not granted anything: the browser never reads tables, and RLS is on with no
-- policies as a second lock.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

-- Tables added by later migrations get the same grant.
alter default privileges in schema public
  grant all on tables to service_role;
