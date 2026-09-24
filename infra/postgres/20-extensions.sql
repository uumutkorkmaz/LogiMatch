-- postgis/postgis imajı postgis'i template1 ve ana DB'ye zaten kurar.
-- btree_gist: EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) için gerekli.
-- pg_trgm: firma adı / adres bulanık arama. citext: e-posta.

CREATE EXTENSION IF NOT EXISTS postgis;
-- İmajın kurduğu ama kullanmadığımız eklentiler (Prisma bunları şema sapması sayar).
DROP EXTENSION IF EXISTS postgis_tiger_geocoder CASCADE;
DROP EXTENSION IF EXISTS postgis_topology CASCADE;
DROP EXTENSION IF EXISTS fuzzystrmatch CASCADE;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE DATABASE logimatch_test;
\connect logimatch_test

CREATE EXTENSION IF NOT EXISTS postgis;
-- İmajın kurduğu ama kullanmadığımız eklentiler (Prisma bunları şema sapması sayar).
DROP EXTENSION IF EXISTS postgis_tiger_geocoder CASCADE;
DROP EXTENSION IF EXISTS postgis_topology CASCADE;
DROP EXTENSION IF EXISTS fuzzystrmatch CASCADE;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
