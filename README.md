# Artisan Agent 🌿

A two-agent WhatsApp system for independent craftspeople. Agent 1 is a WhatsApp bot that onboards makers and generates brand profiles and e-commerce listings. Agent 2 is an OpenClaw cron agent that reads those files weekly to run market research, collect sales metrics, and deliver personalised newsletters back through WhatsApp.

No shared database required — both agents communicate entirely through files.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT 1 — WhatsApp Bot                   │
│                          bot.js  ·  photoAgent.js               │
│                          Node.js process                         │
│                                                                  │
│  User sends photos + answers questions via WhatsApp             │
│       ↓                                                          │
│  Vision analysis (Gemini) → Brand positioning (Qwen3)           │
│  → E-commerce listing (Qwen3) → AI product photo (Gemini)       │
│       ↓                                                          │
│  Writes per user:                                                │
│    {id}.json · {id}_products.json          (source of truth)    │
│    {id}_USER_PROFILE.md · {id}_PRODUCTS.md (markdown export)    │
└───────────────────────┬─────────────────────────────────────────┘
                        │ markdown files passed to Agent 2
┌───────────────────────▼─────────────────────────────────────────┐
│                        AGENT 2 — Research Agent                 │
│                          OpenClaw cron tasks                     │
│                          Runs weekly, no JS files                │
│                                                                  │
│  Reads:  {id}_USER_PROFILE.md · {id}_PRODUCTS.md                │
│  Config: AGENT02_PROMPTS.md                                      │
│                                                                  │
│  CRON TASK 1 — Revenue Detection                                │
│    → Messages each user via WhatsApp asking for weekly metrics  │
│    → User replies with sales data                               │
│    → Writes/updates user{n}_revenue_detection.csv               │
│                                                                  │
│  CRON TASK 2 — Market Research                                  │
│    → Scrapes Etsy / Shopify / Instagram / Google Shopping /     │
│       Amazon for competitor pricing and trend signals           │
│    → Cross-references user{n}_revenue_detection.csv             │
│    → Writes/updates user{n}_rebranding.md                       │
│    → Generates personalised newsletter                          │
│    → Queues WhatsApp delivery back through Agent 1              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
artisan-agent/
│
│── AGENT 1 (Node.js) ──────────────────────────────────────────
├── bot.js                      # WhatsApp session + conversation flow
├── photoAgent.js               # AI calls: vision, positioning, listing, image gen
├── markdownExporter.js         # Auto-generates .md files on every profile/product save
│
│── AGENT 2 (OpenClaw cron) ────────────────────────────────────
├── AGENT02_PROMPTS.md          # Prompt config for Agent 2 cron tasks
│
│── SHARED FILES ───────────────────────────────────────────────
├── profiles/                   # Created automatically by Agent 1
│   ├── {id}.json               # Brand profile — source of truth
│   ├── {id}_products.json      # Product listing log — source of truth
│   ├── {id}_USER_PROFILE.md    # Read by Agent 2
│   └── {id}_PRODUCTS.md        # Read by Agent 2
│
│── AGENT 2 OUTPUTS ────────────────────────────────────────────
├── user01_revenue_detection.csv
├── user01_rebranding.md
├── user02_revenue_detection.csv
├── user02_rebranding.md
│   ...                         # One pair of files per user
│
│── CONFIG ─────────────────────────────────────────────────────
├── .env                        # API keys — never commit
├── .wwebjs_auth/               # WhatsApp session cache
└── package.json
```

---

## Prerequisites

- **Node.js** v18 or higher — [nodejs.org](https://nodejs.org)
- **Google Chrome or Chromium** — used by Puppeteer to run WhatsApp Web
- A **WhatsApp account** to link as the bot number
- API keys for **Flock** and **Google Gemini**
- **OpenClaw** — for running Agent 2 cron tasks

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

### 3. Create your `.env` file

```env
# Flock — vision analysis + text generation
FLOCK_API_KEY=your_flock_api_key_here
FLOCK_BASE_URL=https://api.flock.io/v1

# Gemini — direct image generation
GEMINI_API_KEY=your_gemini_api_key_here
```

Where to get each key:

- **Flock** — from your Flock dashboard. Provides access to `gemini-3-flash-preview` (vision) and `qwen3-235b-a22b-instruct-2507` (text)
- **Gemini** — from [aistudio.google.com](https://aistudio.google.com). Used directly for `gemini-3.1-flash-image-preview` image generation

> ⚠️ Never commit `.env`. Add it to `.gitignore`.

### 4. Run Agent 1

```bash
node bot.js
```

On first run a QR code appears in the terminal. Open WhatsApp on your phone → **Linked Devices** → **Link a Device** → scan the QR code.

Once linked:

```
✅ WhatsApp bot ready!
```

The session is saved to `.wwebjs_auth/` — you won't need to scan again unless you unlink the device or delete the folder.

Every time a user saves a profile or listing, Agent 1 automatically writes their `_USER_PROFILE.md` and `_PRODUCTS.md` to `profiles/`. These are the files Agent 2 reads.

### 5. Set up Agent 2 (OpenClaw)

Agent 2 has no JS files — it runs entirely as OpenClaw cron tasks configured via `AGENT02_PROMPTS.md`.

Set up the two cron tasks in OpenClaw pointing at your project directory. Agent 2 reads `profiles/{id}_USER_PROFILE.md` and `profiles/{id}_PRODUCTS.md` for each user and writes its output files (`user{n}_revenue_detection.csv`, `user{n}_rebranding.md`) back to the project root.

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
→ Profile saved + USER_PROFILE.md and PRODUCTS.md exported
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
→ Saved + PRODUCTS.md exported
```

---

## Agent 2 — Cron Tasks

Both tasks are configured in `AGENT02_PROMPTS.md` and run via OpenClaw.

### Task 1 — Revenue Detection
Sends each onboarded user a WhatsApp message asking for their weekly sales metrics. Parses the reply and writes/updates `user{n}_revenue_detection.csv` with the new data.

### Task 2 — Market Research
Reads each user's `_USER_PROFILE.md` and `_PRODUCTS.md`, then scrapes Etsy, Shopify, Instagram, Google Shopping, and Amazon for:
- Competitor pricing in the user's craft category and positioning tier
- Trend signals — rising search tags, new product formats, seasonal demand

Cross-references findings against `user{n}_revenue_detection.csv`, updates `user{n}_rebranding.md` with benchmarks and signals, and queues a personalised newsletter for WhatsApp delivery via Agent 1.

---

## File Handoff Between Agents

```
Agent 1 writes                    Agent 2 reads
──────────────────────────────────────────────────────
profiles/{id}_USER_PROFILE.md  →  brand identity, positioning, story
profiles/{id}_PRODUCTS.md      →  listing history, materials, pricing

Agent 2 writes                    Agent 2 reads (next run)
──────────────────────────────────────────────────────
user{n}_revenue_detection.csv  →  sales trends over time
user{n}_rebranding.md          →  market benchmarks + signals
```

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
- Failures are non-fatal — the listing text is delivered and the photo step is skipped with a warning

**Flock API errors**
- Check `FLOCK_API_KEY` and `FLOCK_BASE_URL` are correct
- Confirm your Flock account has access to both `gemini-3-flash-preview` and `qwen3-235b-a22b-instruct-2507`

**Bot stops mid-conversation**
The user can send `restart` to reset their session, or `menu` if already onboarded.

**Agent 2 can't find a user's files**
Confirm that `profiles/{id}_USER_PROFILE.md` and `profiles/{id}_PRODUCTS.md` exist. These are only written after a user completes onboarding and saves their first profile. Check that Agent 1 ran `markdownExporter` successfully by looking for the `📄 Profile MD exported` log line.

---

## `.gitignore` recommendation

```gitignore
.env
.wwebjs_auth/
node_modules/
profiles/
user*_revenue_detection.csv
user*_rebranding.md
```

> `profiles/` and the Agent 2 output files contain personal user data — do not commit them.

---

## License

MIT
