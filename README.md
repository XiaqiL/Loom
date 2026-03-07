# Loom
Imperial OpenClaw Agent Hackathon

## agent1-SOUL.md enables agent1 (whatsapp bot) handles the job for users
Firstly, welcome and onboard the user.
after onboarding, users get a 3-option menu: new craft listing, update brand, or view profile.
New craft listing — for every new piece, Agent 1 collects photos, analyses them, then generates a full e-commerce pack: SEO title, 150–200 word description in the artisan's own tone of voice, 13 Etsy tags, 8 Shopify tags, price recommendation, and photo direction tips. Everything gets recorded in PRODUCTS.md with the date.
USER_PROFILE.md — a dedicated file with the full brand profile and brand history log, explicitly formatted to be passed to Agent 2 for personalised pricing research. Every brand update is appended with a date so Agent 2 can track positioning changes over time.

## Architecture
AGENT 1 (WhatsApp Bot)
  Onboarding / listing flow
  → writes USER_PROFILE.md → brands table
  → writes PRODUCTS.md     → listings table

         ↓ passes files to

AGENT 2 (Weekly Cron — Research Agent)
  Reads user.md + product.md from DB
  │
  ├── CRON TASK 1 — Revenue Detection
  │     → messages user via WhatsApp asking for weekly shop metrics
  │     → user replies with sales data
  │     → Agent 2 parses + updates revenue_detection.csv
  │
  └── CRON TASK 2 — Market Research
        → scrapes Etsy / Shopify / Instagram / Google Shopping / Amazon
        → cross-references revenue_detection.csv
        → updates rebranding.md with pricing benchmarks + trend signals
        → queues WhatsApp newsletter summary → newsletter_queue table

AGENT 1 (newsletter_inbox mode)
  → reads newsletter_queue
  → delivers weekly summary to user via WhatsApp
