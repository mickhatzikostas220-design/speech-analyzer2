-- Run this in Supabase Dashboard → SQL Editor
-- Adds text style, intro title, and text overlay columns to timeline_projects

alter table timeline_projects
  add column if not exists text_style   jsonb,
  add column if not exists intro_title  jsonb,
  add column if not exists text_overlays jsonb default '[]'::jsonb;
