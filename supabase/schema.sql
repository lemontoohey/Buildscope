-- Owner-build tracker — Supabase/Postgres schema.
--
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query)
-- for your own Supabase project. It mirrors the local SQLite schema
-- (sqlite-db.js) exactly, column for column, so the app's REST-based store
-- (lib/store.js) works identically against either backend.
--
-- Dates/timestamps are stored as TEXT (ISO strings), matching the app's
-- existing convention — this keeps formatting logic identical between the
-- SQLite and Supabase backends rather than diverging on date types.
--
-- Row Level Security is left OFF. This is a private, single-household tool,
-- not a public multi-tenant app — if you ever expose this server to the
-- public internet, add auth and RLS policies before doing so.

create table if not exists budget_categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  budgeted_cents bigint not null default 0,
  sort_order integer not null default 0
);

create table if not exists documents (
  id text primary key,
  filename text not null,
  mime_type text,
  category text not null default 'Other',
  file_path text not null,
  uploaded_at text not null
);

create table if not exists transactions (
  id bigint generated always as identity primary key,
  category_id bigint not null references budget_categories(id),
  txn_date text not null,
  supplier text,
  description text,
  amount_cents bigint not null,
  gst_cents bigint not null default 0,
  document_id text references documents(id),
  note text,
  ai_generated boolean not null default false,
  xero_invoice_id text,
  created_at text not null
);

create table if not exists diary_entries (
  id bigint generated always as identity primary key,
  entry_date text not null,
  weather text,
  trades_present text,
  work_done text,
  issues text,
  raw_note text,
  ai_generated boolean not null default false,
  delay_flagged boolean not null default false,
  schedule_note text,
  created_at text not null
);

create table if not exists boq_items (
  id bigint generated always as identity primary key,
  category_id bigint not null references budget_categories(id),
  description text not null,
  quantity double precision,
  unit text,
  unit_cost_cents bigint,
  supplier text,
  status text not null default 'not_ordered',
  note text,
  created_at text not null
);

create table if not exists quotes (
  id bigint generated always as identity primary key,
  boq_item_id bigint not null references boq_items(id),
  supplier text not null,
  price_cents bigint not null,
  quote_date text,
  note text,
  created_at text not null
);

create table if not exists trades (
  id bigint generated always as identity primary key,
  name text not null,
  trade_type text,
  phone text,
  email text,
  licence_number text,
  insurance_expiry text,
  scope_notes text,
  created_at text not null
);

create table if not exists schedule_stages (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order integer not null default 0,
  planned_start text,
  planned_end text,
  actual_start text,
  actual_end text,
  status text not null default 'not_started',
  notes text
);

create table if not exists compliance_items (
  id bigint generated always as identity primary key,
  regime text not null,
  item text not null,
  status text not null default 'pending',
  due_date text,
  document_id text references documents(id),
  notes text,
  sort_order integer not null default 0,
  unique (regime, item)
);

create table if not exists settings (
  key text primary key,
  value text
);

-- Seed data — identical to sqlite-db.js's DEFAULT_CATEGORIES / DEFAULT_STAGES
-- / DEFAULT_COMPLIANCE, a starting point for a typical Australian owner-build.
-- Uses "on conflict do nothing" so this is safe to re-run.

insert into budget_categories (name, budgeted_cents, sort_order) values
  ('Site establishment & earthworks', 0, 0),
  ('Retaining & cut-fill', 0, 1),
  ('Septic / on-site wastewater system', 0, 2),
  ('Water tanks (drinking, BASIX, bushfire)', 0, 3),
  ('Footings & slab', 0, 4),
  ('Structural frame (steel & timber)', 0, 5),
  ('Roofing (Colorbond) & solar', 0, 6),
  ('External cladding & stonework', 0, 7),
  ('Windows & doors', 0, 8),
  ('Waterproofing', 0, 9),
  ('Plumbing rough-in & fixout', 0, 10),
  ('Electrical rough-in & fixout', 0, 11),
  ('Insulation', 0, 12),
  ('Plasterboard & internal linings', 0, 13),
  ('Painting', 0, 14),
  ('Kitchen & joinery', 0, 15),
  ('Flooring & tiling', 0, 16),
  ('Bathroom fixtures', 0, 17),
  ('Pool & fencing', 0, 18),
  ('Driveway & external works', 0, 19),
  ('Landscaping', 0, 20),
  ('Fencing (property & pool safety)', 0, 21),
  ('Council/certifier fees', 0, 22),
  ('Contingency', 0, 23)
on conflict (name) do nothing;

insert into schedule_stages (name, sort_order, status) values
  ('Site establishment', 0, 'not_started'),
  ('Earthworks & retaining', 1, 'not_started'),
  ('Footings', 2, 'not_started'),
  ('Slab', 3, 'not_started'),
  ('Structural frame', 4, 'not_started'),
  ('Roof', 5, 'not_started'),
  ('Lock-up (windows & doors)', 6, 'not_started'),
  ('Rough-in (plumbing, electrical, wastewater)', 7, 'not_started'),
  ('Insulation & plasterboard', 8, 'not_started'),
  ('Fix-out (carpentry, joinery)', 9, 'not_started'),
  ('Flooring & tiling', 10, 'not_started'),
  ('Painting', 11, 'not_started'),
  ('External works (driveway, pool, landscaping)', 12, 'not_started'),
  ('Final inspections & occupation certificate', 13, 'not_started')
on conflict (name) do nothing;

create table if not exists plan_sheets (
  id bigint generated always as identity primary key,
  document_id text not null,
  page_number integer not null default 1,
  name text,
  scale_label text,
  pixels_per_metre double precision,
  rotation integer not null default 0,
  created_at text not null
);

create table if not exists plan_measurements (
  id bigint generated always as identity primary key,
  sheet_id bigint not null,
  kind text not null,
  label text not null,
  quantity double precision not null,
  unit text not null,
  color text,
  depth_m double precision,
  points_json text not null,
  category_id bigint,
  boq_item_id bigint,
  created_at text not null
);

create table if not exists suppliers (
  id bigint generated always as identity primary key,
  key text,
  name text not null,
  region text,
  website text,
  notes text,
  sort_order integer not null default 0
);

create table if not exists price_book_items (
  id bigint generated always as identity primary key,
  supplier_id bigint not null,
  sku text,
  description text not null,
  unit text not null,
  unit_cost_cents bigint not null,
  category text,
  notes text,
  sort_order integer not null default 0,
  source text
);

create table if not exists formulate_recipes (
  id bigint generated always as identity primary key,
  slug text,
  name text not null,
  description text,
  output_unit text,
  category text,
  variables_json text,
  created_at text not null,
  sort_order integer not null default 0
);

create table if not exists purchase_orders (
  id bigint generated always as identity primary key,
  supplier text not null,
  status text not null default 'draft',
  notes text,
  signature_id bigint,
  created_at text not null,
  price_history_recorded boolean not null default false
);

create table if not exists purchase_order_lines (
  id bigint generated always as identity primary key,
  purchase_order_id bigint not null references purchase_orders(id),
  boq_item_id bigint references boq_items(id),
  description text not null,
  quantity double precision,
  unit text,
  unit_cost_cents bigint,
  sort_order integer not null default 0
);

create table if not exists photos (
  id text primary key,
  filename text not null,
  mime_type text,
  file_path text not null,
  caption text,
  taken_at text not null,
  linked_type text,
  linked_id text,
  is_defect boolean not null default false,
  created_at text not null
);

create table if not exists formulate_lines (
  id bigint generated always as identity primary key,
  recipe_id bigint not null,
  description text not null,
  unit text not null,
  expression text not null,
  wastage_pct double precision not null default 0,
  sku_hint text,
  sort_order integer not null default 0
);

create table if not exists selections (
  id bigint generated always as identity primary key,
  category text not null,
  description text,
  boq_item_id bigint references boq_items(id),
  status text not null default 'pending',
  due_date text,
  notes text,
  created_at text not null
);

create table if not exists selection_options (
  id bigint generated always as identity primary key,
  selection_id bigint not null references selections(id),
  label text not null,
  supplier text,
  unit_cost_cents integer,
  notes text,
  is_chosen integer not null default 0,
  created_at text not null
);

create table if not exists signatures (
  id bigint generated always as identity primary key,
  signer_name text not null,
  image_data text not null,
  signed_at text not null,
  linked_type text,
  linked_id bigint,
  created_at text not null
);

insert into compliance_items (regime, item, status, sort_order) values
  ('DA / Council', 'Footings inspection booked & passed', 'pending', 0),
  ('DA / Council', 'Slab inspection booked & passed', 'pending', 1),
  ('DA / Council', 'Frame inspection booked & passed', 'pending', 2),
  ('DA / Council', 'Waterproofing inspection booked & passed', 'pending', 3),
  ('DA / Council', 'Final inspection booked & passed', 'pending', 4),
  ('DA / Council', 'As-built checked against DA/CDC-approved plans (note any variations)', 'pending', 5),
  ('BASIX', 'Showerheads — minimum star rating per your BASIX certificate', 'pending', 6),
  ('BASIX', 'Toilets — minimum star rating per your BASIX certificate', 'pending', 7),
  ('BASIX', 'Dishwasher — minimum star rating per your BASIX certificate', 'pending', 8),
  ('BASIX', 'Kitchen & bathroom taps — minimum star rating per your BASIX certificate', 'pending', 9),
  ('BASIX', 'Rainwater tank installed & plumbed as specified on your BASIX certificate', 'pending', 10),
  ('BASIX', 'Stormwater detention/reuse installed as specified', 'pending', 11),
  ('BASIX', 'Ceiling insulation installed to the specified R-value', 'pending', 12),
  ('BASIX', 'Wall insulation installed to the specified R-value', 'pending', 13),
  ('BASIX', 'Hot water system meets the specified star rating', 'pending', 14),
  ('BASIX', 'Exhaust fans to bathrooms/laundry/kitchen installed', 'pending', 15),
  ('BASIX', 'LED lighting throughout', 'pending', 16),
  ('BASIX', 'External shading (blinds/eaves) installed as specified', 'pending', 17),
  ('BASIX', 'Clothes line installed', 'pending', 18),
  ('Bushfire (BAL)', 'Assessed BAL rating confirmed with certifier', 'pending', 19),
  ('Bushfire (BAL)', 'Bushfire water supply installed & accessible to fire services', 'pending', 20),
  ('Bushfire (BAL)', 'Construction materials meet BAL rating (windows, decking, external walls)', 'pending', 21),
  ('Bushfire (BAL)', 'Asset Protection Zone (APZ) landscaping maintained', 'pending', 22),
  ('Pool', 'Pool safety fencing to AS1926.1 installed', 'pending', 23),
  ('Pool', 'Pool safety certificate obtained', 'pending', 24),
  ('Pool', 'Pool registered with council/state register', 'pending', 25),
  ('Septic / wastewater', 'On-site wastewater treatment system installed & commissioned', 'pending', 26),
  ('Septic / wastewater', 'Effluent/irrigation area installed per design', 'pending', 27),
  ('Septic / wastewater', 'Council on-site wastewater (health) approval obtained', 'pending', 28),
  ('Septic / wastewater', 'Service contract set up for ongoing maintenance', 'pending', 29)
on conflict (regime, item) do nothing;
