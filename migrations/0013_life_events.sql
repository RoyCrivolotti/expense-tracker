-- Migration: add life_events JSON column to goal_scenarios
-- life_events is a JSON array of {year, amountCents, label} objects.
-- year is a non-negative integer (years from plan start / projection year 0).
-- amountCents is an integer (positive = inflow to invested portfolio, negative = outflow).
-- label is a short description string.
ALTER TABLE goal_scenarios ADD COLUMN life_events TEXT NOT NULL DEFAULT '[]';
