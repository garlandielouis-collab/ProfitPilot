-- Add missing profile columns to businesses table
-- These are needed for the Settings > Profile tab

alter table businesses
  add column if not exists phone   text,
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists tax_id  text;
