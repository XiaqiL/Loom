# Hi! We are Loom 🧶
Imperial OpenClaw Agent Hackathon

<p align="center">
  <img src="assets/image.png" alt="Agent 02 Overall Architecture" width="720"/>
</p>

# Artisan Agent 🌿

A two-agent WhatsApp system for independent craftspeople built on OpenClaw🦞 and Flock.io. Agent 1 onboards makers via WhatsApp and generates brand profiles and e-commerce listings. Agent 2 runs weekly on a cron to scrape competitor data, collect sales metrics, and deliver personalised market intelligence newsletters back through WhatsApp.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT 1 — WhatsApp Bot                   │
│                          bot.js  ·  photoAgent.js               │
│                                                                  │
│  User sends photos + answers questions via WhatsApp             │
│       ↓                                                          │
│  Vision analysis (Gemini) → Brand positioning (Qwen3)           │
│  → E-commerce listing (Qwen3) → AI product photo (Gemini)       │
│       ↓                                                          │
│  Writes → USER_PROFILE.md  ·  PRODUCTS.md  (markdownExporter)   │
│  Writes → brands table  ·  listings table  (Supabase)*          │
└───────────────────────┬─────────────────────────────────────────┘
                        │ shared via local files (or DB if remote)
┌───────────────────────▼─────────────────────────────────────────┐
│                        AGENT 2 — Research Agent                 │
│                          agent2.js  ·  researchAgent.js         │
│                          Runs weekly via cron                    │
│                                                                  │
│  CRON TASK 1 — Revenue Detection                                │
│    → Messages each user via WhatsApp asking for weekly metrics  │
│    → User replies with sales data                               │
│    → Agent 2 parses reply + updates revenue_detection.csv       │
│                                                                  │
│  CRON TASK 2 — Market Research                                  │
│    → Scrapes Etsy / Shopify / Instagram / Google Shopping /     │
│       Amazon for competitor pricing and trend signals           │
│    → Cross-references revenue_detection.csv                     │
│    → Updates rebranding.md with benchmarks + signals            │
│    → Generates personalised newsletter per user                 │
│    → Writes to newsletter_queue table (Supabase)*               │
│      or newsletter_queue.json (local)                           │
└───────────────────────┬─────────────────────────────────────────┘
                        │ reads newsletter_queue
┌───────────────────────▼─────────────────────────────────────────┐
│           AGENT 1 — newsletter_inbox mode                        │
│    → Polls newsletter_queue on startup / scheduled check        │
│    → Delivers weekly summary to each user via WhatsApp          │
│    → Marks messages sent / failed                               │
└─────────────────────────────────────────────────────────────────┘

* Supabase only required when agents run on separate servers.
  When running locally, both agents share the profiles/ folder directly.
```

---

## Deployment Modes

### Local (recommended for getting started)

Both agents run on the same machine. They share data through the `profiles/` folder — no database needed.

- Agent 1 writes `{id}.json`, `{id}_products.json`, `{id}_USER_PROFILE.md`, `{id}_PRODUCTS.md`
- Agent 2 reads those files directly from `profiles/`
- Newsletter queue is handled via a local `newsletter_queue.json` file
- No Supabase setup required

### Remote (production / multi-server)

Agents run on separate machines (e.g. Agent 1 on a VPS, Agent 2 on a separate cron server). A shared Supabase database replaces the local file store.

- Agent 1 writes to `brands`, `listings`, `users` tables in Supabase
- Agent 2 reads from those tables and writes to `newsletter_queue`
- Agent 1 polls `newsletter_queue` to deliver newsletters
- Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`

---

## Project Structure

```
artisan-agent/
├── bot.js                    # Agent 1 — WhatsApp session + conversation flow
├── photoAgent.js             # AI calls: vision, brand positioning, listing, image gen
├── markdownExporter.js       # Auto-generates .md files from JSON profiles
├── agent2.js                 # Agent 2 — weekly cron: research + newsletter generation
├── researchAgent.js          # Scraping + analysis logic (plug in your own)
├── db.js                     # Shared Supabase DB module (remote mode only)
├── schema.sql                # Postgres schema — remote mode only
│
├── profiles/                 # Created automatically — one folder shared by both agents
│   ├── {id}.json
│   ├── {id}_products.json
│   ├── {id}_USER_PROFILE.md
│   └── {id}_PRODUCTS.md
│
├── newsletter_queue.json     # Local newsletter queue (local mode only)
├── revenue_detection.csv     # Updated by Agent 2 with weekly user-reported sales
├── rebranding.md             # Updated by Agent 2 with market research + trend signals
│
├── .env                      # API keys — never commit
├── .wwebjs_auth/             # WhatsApp session cache — created on first QR scan
└── package.json
```

---

## Prerequisites

- **Node.js** v18 or higher — [nodejs.org](https://nodejs.org)
- **Google Chrome or Chromium** — used by Puppeteer to run WhatsApp Web
- A **WhatsApp account** to link as the bot number
- API keys for **Flock** and **Google Gemini**
- **Supabase** — only needed for remote/multi-server deployment (see above)

---

## Setup

### 1. Clone the project

```bash
git clone https://github.com/your-repo/artisan-agent.git
cd artisan-agent
```

### 2. Install dependencies

```bash
npm install
```

This installs:

| Package | Purpose |
|---|---|
| `whatsapp-web.js` | WhatsApp Web automation |
| `qrcode-terminal` | QR code display in terminal |
| `axios` | HTTP requests to Flock and Gemini APIs |
| `dotenv` | Environment variable loader |
| `puppeteer` | Headless browser for WhatsApp Web |
| `@supabase/supabase-js` | Shared database client (remote mode only) |

### 3. Create your `.env` file

**Local mode** — only AI keys needed:

```env
# Flock — vision analysis + text generation
FLOCK_API_KEY=your_flock_api_key_here
FLOCK_BASE_URL=https://api.flock.io/v1

# Gemini — direct image generation
GEMINI_API_KEY=your_gemini_api_key_here
```

**Remote mode** — add Supabase credentials:

```env
FLOCK_API_KEY=your_flock_api_key_here
FLOCK_BASE_URL=https://api.flock.io/v1

GEMINI_API_KEY=your_gemini_api_key_here

# Supabase — shared database (remote mode only)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Where to get each key:

- **Flock** — from your Flock dashboard. Provides access to `gemini-3-flash-preview` (vision) and `qwen3-235b-a22b-instruct-2507` (text)
- **Gemini** — from [aistudio.google.com](https://aistudio.google.com). Used directly for `gemini-3.1-flash-image-preview` image generation
- **Supabase** _(remote only)_ — from your Supabase project under **Settings → API**. Use the service role key, not the anon key — it's only used server-side

> ⚠️ Never commit `.env`. Add it to `.gitignore`.

### 4. Database setup (remote mode only)

In your Supabase project, open the **SQL Editor** and run the contents of `schema.sql`. This creates four tables:

| Table | Purpose |
|---|---|
| `users` | One row per WhatsApp number, tracks onboarding status |
| `brands` | Brand profile, positioning, and history per user |
| `listings` | All product listings with AI-generated content |
| `newsletter_queue` | Messages queued by Agent 2, delivered by Agent 1 |

Skip this step entirely if running locally.

### 5. Run Agent 1 (WhatsApp Bot)

```bash
node bot.js
```

On first run a QR code appears in the terminal. Open WhatsApp on your phone → **Linked Devices** → **Link a Device** → scan the QR code.

Once linked:

```
✅ WhatsApp bot ready!
```

The session is saved to `.wwebjs_auth/` — you won't need to scan again unless you unlink the device or delete the folder.

### 6. Run Agent 2 (Research Cron)

Agent 2 can be run manually or scheduled via cron. It reads from `profiles/` (local mode) or Supabase (remote mode).

**Manual run:**
```bash
node agent2.js
```

**Weekly cron (every Monday at 8am):**
```bash
crontab -e
```
Add:
```
0 8 * * 1 cd /path/to/artisan-agent && node agent2.js >> logs/agent2.log 2>&1
```

---

## Models Used

| Task | Provider | Model |
|---|---|---|
| Photo analysis (vision) | Flock → Gemini | `gemini-3-flash-preview` |
| Brand positioning generation | Flock → Qwen | `qwen3-235b-a22b-instruct-2507` |
| Listing copywriting | Flock → Qwen | `qwen3-235b-a22b-instruct-2507` |
| Image prompt generation | Flock → Qwen | `qwen3-235b-a22b-instruct-2507` |
| Product photo generation | Gemini direct | `gemini-3.1-flash-image-preview` |

---

## Agent 1 — User Flows

### New user onboarding
```
Welcome → Consent → Name → Brand name → Brand location → Brand story
→ Product photos (2 required, 4 optional + extras)
→ Workspace photo (optional)
→ Hours · Materials · Positioning preference
→ 3 brand profiles generated → User chooses one
→ Profile saved + markdown exported
```

### Returning user menu
```
1️⃣  New craft listing
2️⃣  Update my brand
3️⃣  View my profile
4️⃣  Create new profile
```

### New craft listing
```
Send photos → Extra close-ups (optional)
→ Craft story for this piece (optional, skippable)
→ Hours · Materials · Price (optional)
→ Full listing generated (title, description, tags, price, photo tips)
→ AI product photo generated
→ Save or request edits
→ Saved + markdown exported
```

### Newsletter inbox (triggered by Agent 2 queue)
```
Agent 2 writes newsletter to queue
→ Agent 1 polls queue on startup / scheduled interval
→ Delivers message to user via WhatsApp
→ Marks as sent
```

---

## Agent 2 — Cron Tasks

### Task 1 — Revenue Detection
Sends each onboarded user a WhatsApp message asking for their weekly sales metrics. When the user replies, Agent 2 parses the response and appends a new row to `revenue_detection.csv`.

### Task 2 — Market Research
Scrapes Etsy, Shopify, Instagram, Google Shopping, and Amazon for:
- Competitor pricing in the user's craft category and positioning tier
- Trend signals — rising search tags, emerging product formats, seasonal demand

Cross-references scraped data against `revenue_detection.csv` to identify pricing gaps and opportunities. Updates `rebranding.md` with benchmarks and signals per brand, then generates a personalised newsletter queued for WhatsApp delivery.

---

## Data & Files

### Shared between agents (local mode — `profiles/`)

| File | Written by | Read by |
|---|---|---|
| `{id}.json` | Agent 1 | Agent 2 |
| `{id}_products.json` | Agent 1 | Agent 2 |
| `{id}_USER_PROFILE.md` | `markdownExporter.js` | Agent 2 |
| `{id}_PRODUCTS.md` | `markdownExporter.js` | Agent 2 |
| `newsletter_queue.json` | Agent 2 | Agent 1 |

### Shared between agents (remote mode — Supabase)

| Table | Written by | Read by |
|---|---|---|
| `users` | Agent 1 | Agent 2 |
| `brands` | Agent 1 | Agent 2 |
| `listings` | Agent 1 | Agent 2 |
| `newsletter_queue` | Agent 2 | Agent 1 |

### Agent 2 output files (both modes)

| File | Contents |
|---|---|
| `revenue_detection.csv` | Weekly sales data per user, updated from WhatsApp replies |
| `rebranding.md` | Market research findings, pricing benchmarks, trend signals per brand |

---

## Special Commands (Agent 1)

| Message | Action |
|---|---|
| `menu` | Return to main menu (returning users) |
| `restart` / `/start` | Reset current session (profile kept) |
| `clear` / `reset` / `delete my data` | Permanently delete all data for this number |
| `done` | Advance past optional photo steps |
| `skip` | Skip optional questions |

---

## Troubleshooting

**QR code not appearing**
Wait up to 30 seconds after running `node bot.js`. If nothing appears, confirm Chrome or Chromium is installed and accessible in your system path.

**Auth failed on startup**
The session cache may be corrupted. Delete it and re-scan:
```bash
rm -rf .wwebjs_auth
node bot.js
```

**Gemini image generation fails**
- Confirm `GEMINI_API_KEY` is set in `.env`
- The key must have access to `gemini-3.1-flash-image-preview` in Google AI Studio
- Image generation failures are non-fatal — the listing text is delivered and the photo step is skipped with a warning

**Flock API errors**
- Check `FLOCK_API_KEY` and `FLOCK_BASE_URL` are correct
- Confirm your Flock account has access to both `gemini-3-flash-preview` and `qwen3-235b-a22b-instruct-2507`

**Supabase connection errors** _(remote mode only)_
- Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Use the **service role key**, not the anon/public key
- Check that `schema.sql` has been run in the Supabase SQL editor

**Bot stops mid-conversation**
The user can send `restart` to reset their session, or `menu` if already onboarded.

**Agent 2 skips a user**
In remote mode, check the terminal log for `⚠️ Skipping {phone} — no brand profile`. This means the user started onboarding but no brand row was written to Supabase yet. In local mode, check that `profiles/{id}.json` exists and contains `"onboarded": true`.

---

## `.gitignore` recommendation

```gitignore
.env
.wwebjs_auth/
node_modules/
profiles/
newsletter_queue.json
revenue_detection.csv
rebranding.md
logs/
```

> `profiles/`, `newsletter_queue.json`, and `revenue_detection.csv` contain personal user data — do not commit them.

---

## License

MIT
