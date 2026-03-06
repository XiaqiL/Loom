require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const { analysePhotos, generatePositioningProfiles, generateListing, generateProductPhoto } = require("./photoAgent");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  },
  webVersionCache: {
    type: "remote",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
  },
});

// ── Constants ──────────────────────────────────────────────────────────────
const sessions = {};

const REQUIRED_PHOTOS = [
  { label: "front view",      emoji: "🔵" },
  { label: "close-up detail", emoji: "🔴" },
];

const OPTIONAL_PHOTOS = [
  { label: "side view",  emoji: "🟡" },
  { label: "back view",  emoji: "🟠" },
];

const OTHERS_OPTIONS = [
  { key: "1", label: "Eco / Sustainable" },
  { key: "2", label: "Community / Local Craft" },
  { key: "3", label: "Gift / Occasion-based" },
  { key: "4", label: "Minimalist / Contemporary" },
  { key: "5", label: "Spiritual / Wellness" },
];

// ── Profile storage ────────────────────────────────────────────────────────
const PROFILES_DIR = path.join(__dirname, "profiles");
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR);

function safeId(from) { return from.replace(/[^0-9]/g, ""); }
function profilePath(from) { return path.join(PROFILES_DIR, `${safeId(from)}.json`); }
function productsPath(from) { return path.join(PROFILES_DIR, `${safeId(from)}_products.json`); }

function loadProfile(from) {
  try { return fs.existsSync(profilePath(from)) ? JSON.parse(fs.readFileSync(profilePath(from), "utf8")) : null; }
  catch { return null; }
}

function saveProfile(from, data) {
  fs.writeFileSync(profilePath(from), JSON.stringify(data, null, 2));
}

function appendProduct(from, product) {
  let products = [];
  try { if (fs.existsSync(productsPath(from))) products = JSON.parse(fs.readFileSync(productsPath(from), "utf8")); } catch {}
  products.push({ ...product, date_listed: new Date().toISOString() });
  fs.writeFileSync(productsPath(from), JSON.stringify(products, null, 2));
}

function getProducts(from) {
  try { return fs.existsSync(productsPath(from)) ? JSON.parse(fs.readFileSync(productsPath(from), "utf8")) : []; }
  catch { return []; }
}

// ── Client events ──────────────────────────────────────────────────────────
client.on("qr", (qr) => { qrcode.generate(qr, { small: true }); console.log("📱 Scan QR → Linked Devices"); });
client.on("ready", () => console.log("✅ WhatsApp bot ready!"));
client.on("auth_failure", () => console.log("❌ Auth failed — delete .wwebjs_auth and retry"));

// ── Message handler ────────────────────────────────────────────────────────
client.on("message", async (msg) => {
  if (msg.from.includes("@g.us")) return;

  const from = msg.from;
  const text = msg.body.trim();
  const lower = text.toLowerCase();

  // Hard reset
  if (["restart", "/start"].includes(lower)) delete sessions[from];


  // Full history wipe
  if (["clear", "reset", "start over", "delete my data", "/reset", "/clear"].includes(lower)) {
    sessions[from] = { phase: "confirm_clear" };
    await msg.reply(
      "⚠️ *Are you sure?*\n\n" +
      "This will permanently delete:\n" +
      "• Your brand profile\n" +
      "• All saved product listings\n" +
      "• Your onboarding history\n\n" +
      "Type *DELETE* to confirm, or anything else to cancel."
    );
    return;
  }

  // Confirm clear
  if (sessions[from]?.phase === "confirm_clear") {
    if (text.trim() === "DELETE") {
      try { if (fs.existsSync(profilePath(from))) fs.unlinkSync(profilePath(from)); } catch {}
      try { if (fs.existsSync(productsPath(from))) fs.unlinkSync(productsPath(from)); } catch {}
      delete sessions[from];
      await msg.reply(
        "🗑 *All your data has been deleted.*\n\n" +
        "You're starting fresh — type *hi* whenever you're ready to begin again. 🌿"
      );
    } else {
      delete sessions[from];
      await msg.reply("👍 No changes made. Type *menu* to continue.");
    }
    return;
  }
  // "menu" shortcut for returning users
  if (lower === "menu" && loadProfile(from)?.onboarded) {
    sessions[from] = { phase: "menu", profile: loadProfile(from) };
    await showMenu(from, sessions[from].profile.name);
    return;
  }

  const profile = loadProfile(from);

  // ── RETURNING USER — no active session ──
  if (profile?.onboarded && !sessions[from]) {
    sessions[from] = { phase: "menu", profile };
    // If they sent a photo straight away, jump to listing
    if (msg.hasMedia) {
      sessions[from].phase = "listing_photos";
      sessions[from].photos = [];
      sessions[from].answers = {};
      await handleListingPhoto(from, msg, sessions[from]);
      return;
    }
    await showMenu(from, profile.name);
    return;
  }

  const session = sessions[from];

  // ── MENU ───────────────────────────────────────────────────────────────
  if (session?.phase === "menu") {
    if (msg.hasMedia) {
      session.phase = "listing_photos";
      session.photos = [];
      session.answers = {};
      await handleListingPhoto(from, msg, session);
      return;
    }
    if (["1", "new", "listing"].includes(lower)) {
      session.phase = "listing_photos";
      session.photos = [];
      session.answers = {};
      await msg.reply(
        "📸 *New Craft Listing*\n\n" +
        "Please send at least *2 photos* of your piece:\n\n" +
        "🔵 Photo 1 — *Front view* _(required)_\n" +
        "🔴 Photo 2 — *Close-up detail* _(required)_\n" +
        "🟡 Photo 3 — *Side view* _(optional)_\n" +
        "🟠 Photo 4 — *Back view* _(optional)_\n\n" +
        "_Send your front view first 📸_"
      );
      return;
    }
    if (["2", "brand", "update"].includes(lower)) {
      session.phase = "brand_update_choice";
      await msg.reply(
        `🔄 *Update Brand Positioning*\n\n` +
        `Your current positioning: *${session.profile.positioning?.toUpperCase()}*\n\n` +
        `1️⃣  *Regenerate* — start fresh with 3 new profiles\n` +
        `2️⃣  *Tweak* — adjust your current positioning\n\n_Reply 1 or 2_`
      );
      return;
    }
    if (["3", "profile", "view"].includes(lower)) {
      const products = getProducts(from);
      await msg.reply(
        `🎨 *Your Brand Profile*\n\n` +
        `*Name:* ${session.profile.name}\n` +
        `*Brand:* ${session.profile.brand_name}\n` +
        `*Positioning:* ${session.profile.positioning?.toUpperCase()}\n\n` +
        `_${session.profile.brand_statement}_\n\n` +
        `👤 *Customer:* ${session.profile.target_audience}\n` +
        `🗣 *Tone:* ${session.profile.tone_of_voice}\n` +
        `💰 *Price tier:* ${session.profile.price_positioning}\n` +
        `✨ *Key message:* "${session.profile.key_message}"\n\n` +
        `📦 *Products listed:* ${products.length}\n` +
        `🗓 *Member since:* ${new Date(session.profile.onboarded_at).toLocaleDateString("en-GB")}\n\n` +
        `_Reply *menu* to go back_`
      );
      return;
    }
    await msg.reply("Please reply with *1*, *2*, or *3* to choose an option. 🌿");
    return;
  }

  // ── LISTING PHOTOS ─────────────────────────────────────────────────────
  if (session?.phase === "listing_photos") {
    await handleListingPhoto(from, msg, session);
    return;
  }

  // ── LISTING EXTRA PHOTOS ───────────────────────────────────────────────
  if (session?.phase === "listing_extra_photos") {
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media?.data) {
          session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
          const extras = session.photos.filter((_, i) => i >= REQUIRED_PHOTOS.length + OPTIONAL_PHOTOS.length).length;
          await msg.reply(`✅ Extra close-up ${extras} added! Send another, or type *done*.`);
        }
      } catch { await msg.reply("⚠️ Problem with that photo. Try again."); }
      return;
    }
    if (["done", "next", "continue"].includes(lower)) {
      session.phase = "listing_q1";
      await msg.reply("⏱ *How many hours did this piece take?*\n\n_e.g._ *4* _or_ *0.5*");
    } else {
      await msg.reply("Send another close-up, or type *done* to continue. 📸");
    }
    return;
  }

  // ── LISTING Q1 ─────────────────────────────────────────────────────────
  if (session?.phase === "listing_q1") {
    const hours = parseFloat(text.replace(/[^0-9.]/g, ""));
    if (isNaN(hours) || hours <= 0) { await msg.reply("Please enter a number, e.g. *3* ⏱"); return; }
    session.answers.hours = hours;
    session.phase = "listing_q2";
    await msg.reply("🪡 *What materials did you use?*\n\n_e.g. hand-dyed silk, reclaimed oak_");
    return;
  }

  // ── LISTING Q2 ─────────────────────────────────────────────────────────
  if (session?.phase === "listing_q2") {
    if (text.length < 3) { await msg.reply("Could you describe the materials in more detail? 🪡"); return; }
    session.answers.materials = text;
    session.phase = "listing_q3";
    await msg.reply(
      "💰 *What price are you thinking?*\n\n" +
      "_Optional — type a number or *skip* and I'll suggest a price_"
    );
    return;
  }

  // ── LISTING Q3 ─────────────────────────────────────────────────────────
  if (session?.phase === "listing_q3") {
    if (!["skip", "s"].includes(lower)) {
      const price = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (!isNaN(price) && price > 0) session.answers.price = price;
    }
    await runListingPipeline(from, session);
    return;
  }

  // ── LISTING CONFIRM ────────────────────────────────────────────────────
  if (session?.phase === "listing_confirm") {
    if (["save", "yes", "y"].includes(lower)) {
      appendProduct(from, session.listing);
      session.phase = "menu";
      await msg.reply("✅ *Listing saved!*\n\nSend more photos anytime to create another listing, or type *menu*. 🌿");
    } else {
      session.editFeedback = text;
      session.phase = "listing_edit";
      await runListingEdit(from, session);
    }
    return;
  }

  // ── LISTING EDIT ───────────────────────────────────────────────────────
  if (session?.phase === "listing_edit") {
    session.editFeedback = text;
    await runListingEdit(from, session);
    return;
  }

  // ── BRAND UPDATE ───────────────────────────────────────────────────────
  if (session?.phase === "brand_update_choice") {
    if (text === "1") {
      session.phase = "brand_regen_photos";
      session.photos = [];
      await msg.reply(
        "📸 Send photos of your latest piece:\n\n🔵 Front view _(required)_ · 🔴 Close-up _(required)_\n🟡 Side view _(optional)_ · 🟠 Back view _(optional)_\n\n_Send your front view first_"
      );
    } else if (text === "2") {
      session.phase = "brand_tweak";
      await msg.reply("✏️ What feels off about your current positioning? Tell me in your own words.");
    } else {
      await msg.reply("Reply *1* to regenerate or *2* to tweak.");
    }
    return;
  }

  if (session?.phase === "brand_tweak") {
    await runBrandTweak(from, session, text);
    return;
  }

  if (session?.phase === "brand_tweak_choose") {
    const keys = Object.keys(session.updatedProfiles);
    const idx = parseInt(lower.replace(/[^0-9]/g, "")) - 1;
    if (isNaN(idx) || idx < 0 || idx >= keys.length) {
      await msg.reply("Please reply with *1*, *2*, or *3*.");
      return;
    }
    const chosen = session.updatedProfiles[keys[idx]];
    const updatedProfile = { ...session.profile, ...chosen,
      brand_history: [...(session.profile.brand_history || []), {
        date: new Date().toISOString(),
        positioning: chosen.positioning,
        brand_statement: chosen.brand_statement,
        reason: session.tweakFeedback || "User-initiated update"
      }]
    };
    saveProfile(from, updatedProfile);
    session.profile = updatedProfile;
    session.phase = "menu";
    await msg.reply(
      `✅ *Brand updated!*\n\n*${chosen.positioning.toUpperCase()}*\n${chosen.brand_statement}\n\n` +
      `All future listings will reflect your new direction. 🌿\n\nType *menu* to continue.`
    );
    return;
  }

  // ── NEW SESSION → ONBOARDING ───────────────────────────────────────────
  if (!sessions[from]) {
    sessions[from] = { phase: "consent", photos: [], answers: {} };
    await msg.reply(
      "👋 *Welcome to Artisan Agent!*\n\n" +
      "I help craftspeople discover the right brand positioning — so you can sell with clarity and confidence.\n\n" +
      "Here's what we'll do:\n" +
      "1️⃣  Send at least 2 photos of your craft (front + close-up)\n" +
      "2️⃣  Answer a few quick questions\n" +
      "3️⃣  Receive your personalised brand direction\n\n" +
      "📋 _Your photos are used only to generate your brand profile and are not stored._\n\n" +
      "Type *Yes* to begin, or *No* to exit."
    );
    return;
  }

  // ── ONBOARDING PHASES ──────────────────────────────────────────────────
  if (session.phase === "consent") {
    if (["yes", "y", "sure", "ok", "okay"].includes(lower)) {
      session.phase = "ask_name";
      await msg.reply("✨ Let's go!\n\nFirst — *what's your name?* 🙏");
    } else if (["no", "n", "nope", "exit"].includes(lower)) {
      await msg.reply("No problem! Come back whenever you're ready. 🌿");
      delete sessions[from];
    } else {
      await msg.reply("Please type *Yes* to begin or *No* to exit.");
    }
    return;
  }

  if (session.phase === "ask_name") {
    if (text.length < 2) { await msg.reply("Could you share your name? 🙏"); return; }
    session.answers.name = text;
    session.phase = "ask_brand";
    await msg.reply(`Lovely to meet you, *${text}*! 🌿\n\nAnd what's the name of your *brand*?`);
    return;
  }

  if (session.phase === "ask_brand") {
    if (text.length < 2) { await msg.reply("Could you share your brand name? 🏷"); return; }
    session.answers.brand_name = text;
    session.phase = "photos";
    await msg.reply(
      `✨ *${text}* — beautiful!\n\n` +
      "📸 *Step 1 — Photos*\n\n" +
      "Please send at least *2 photos* of your product:\n\n" +
      "🔵 Photo 1 — *Front view* _(required)_\n" +
      "🔴 Photo 2 — *Close-up detail* _(required)_\n" +
      "🟡 Photo 3 — *Side view* _(optional)_\n" +
      "🟠 Photo 4 — *Back view* _(optional)_\n\n" +
      "_Send your front view first 📸_"
    );
    return;
  }

  if (session.phase === "photos") {
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (!media?.data) { await msg.reply("⚠️ Couldn't read that photo. Please try again."); return; }
        session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
        const n = session.photos.length;

        if (n < REQUIRED_PHOTOS.length) {
          // Still need required photos
          await msg.reply(`✅ Photo ${n}/${REQUIRED_PHOTOS.length} received!\n\nNext: ${REQUIRED_PHOTOS[n].emoji} *${REQUIRED_PHOTOS[n].label}* _(required)_`);
        } else if (n - REQUIRED_PHOTOS.length < OPTIONAL_PHOTOS.length) {
          // Required done — prompt optional one at a time
          const optIdx = n - REQUIRED_PHOTOS.length;
          const next = OPTIONAL_PHOTOS[optIdx];
          await msg.reply(
            `✅ Photo ${n} received!\n\n` +
            `${next.emoji} *${next.label}* _(optional)_\n\nSend a photo, or type *done* to continue.`
          );
        } else {
          // All 4 collected
          session.phase = "extra_photos";
          await msg.reply(
            "✅ *All photos received!*\n\n" +
            "Would you like to add more close-up detail photos? Send as many as you'd like, then type *done*.\n\n_Or type *done* now._"
          );
        }
      } catch { await msg.reply("⚠️ Problem with that photo. Please try again."); }
    } else {
      const n = session.photos.length;
      if (n < REQUIRED_PHOTOS.length) {
        await msg.reply(
          n === 0
            ? `Please send your front view — ${REQUIRED_PHOTOS[0].emoji} *${REQUIRED_PHOTOS[0].label}* 📸`
            : `Got ${n}/${REQUIRED_PHOTOS.length} required photos. Next: ${REQUIRED_PHOTOS[n].emoji} *${REQUIRED_PHOTOS[n].label}*`
        );
      } else if (["done", "next", "continue", "skip"].includes(lower)) {
        // Skip remaining optional photos
        session.phase = "extra_photos";
        await msg.reply(
          `✅ *${n} photo${n > 1 ? "s" : ""} received.*\n\n` +
          "Would you like to add more close-up detail photos? Send as many as you'd like, then type *done*.\n\n_Or type *done* now._"
        );
      } else {
        const optIdx = n - REQUIRED_PHOTOS.length;
        const next = OPTIONAL_PHOTOS[optIdx];
        await msg.reply(`${next.emoji} *${next.label}* _(optional)_ — send a photo, or type *done* to skip.`);
      }
    }
    return;
  }

  if (session.phase === "extra_photos") {
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media?.data) {
          session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
          await msg.reply(`✅ Extra close-up ${session.photos.length - REQUIRED_PHOTOS.length} added! Send another, or type *done*.`);
        }
      } catch { await msg.reply("⚠️ Problem with that photo. Try again."); }
      return;
    }
    if (["done", "next", "continue"].includes(lower)) {
      session.phase = "workspace_photo";
      await msg.reply(
        `✅ *${session.photos.length} photos total.*\n\n` +
        "🛠 *One more — your world as a maker*\n\n" +
        "Send a photo of your *tools*, *workspace*, or *hands at work*.\n\n" +
        "_Or type *skip* to continue._"
      );
    } else {
      await msg.reply("Send another close-up, or type *done* to continue. 📸");
    }
    return;
  }

  if (session.phase === "workspace_photo") {
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media?.data) session.workspacePhoto = { b64: media.data, type: media.mimetype || "image/jpeg" };
      } catch {}
      session.phase = "q1";
      await msg.reply("✅ *Lovely — your maker story is captured.*\n\n*Question 1*\n⏱ How many hours to make this piece?\n\n_e.g._ *4* _or_ *0.5*");
      return;
    }
    if (["skip", "no", "next"].includes(lower)) {
      session.workspacePhoto = null;
      session.phase = "q1";
      await msg.reply("No problem!\n\n*Question 1*\n⏱ How many hours to make this piece?\n\n_e.g._ *4* _or_ *0.5*");
      return;
    }
    await msg.reply("Send a photo of your workspace or tools — or type *skip*. 📸");
    return;
  }

  if (session.phase === "q1") {
    const hours = parseFloat(text.replace(/[^0-9.]/g, ""));
    if (isNaN(hours) || hours <= 0) { await msg.reply("Please enter a number, e.g. *3* ⏱"); return; }
    session.answers.hours = hours;
    session.phase = "q2";
    await msg.reply("✅ Got it!\n\n*Question 2*\n🪡 What materials did you use?\n\n_e.g. stoneware clay with natural ash glaze_");
    return;
  }

  if (session.phase === "q2") {
    if (text.length < 3) { await msg.reply("Could you describe the materials in more detail? 🪡"); return; }
    session.answers.materials = text;
    session.phase = "q3";
    await msg.reply(
      "✅ Lovely!\n\n*Question 3*\n🎯 How do you want to position your work?\n\n" +
      "*A* — 🏆 *Luxury* — _Premium, exclusive, investment piece_\n\n" +
      "*B* — 🏛 *Heritage* — _Tradition, cultural roots, generational craft_\n\n" +
      "*C* — 🛍 *Everyday* — _Accessible, functional, e-commerce ready_\n\n" +
      "*D* — 🌐 *Other direction*\n\n_Reply A, B, C, or D_"
    );
    return;
  }

  if (session.phase === "q3") {
    const map = { a: "luxury", b: "heritage", c: "everyday" };
    const choice = lower.replace(/[^a-d]/g, "").charAt(0);
    if (map[choice]) {
      session.answers.positioning = map[choice];
      await runOnboardingPipeline(from, session);
    } else if (choice === "d") {
      session.phase = "q3_others";
      await msg.reply(
        "Which direction resonates most?\n\n" +
        OTHERS_OPTIONS.map((o) => `*${o.key}* — ${o.label}`).join("\n") +
        "\n\n_Reply 1–5_"
      );
    } else {
      await msg.reply("Please reply with *A*, *B*, *C*, or *D*.");
    }
    return;
  }

  if (session.phase === "q3_others") {
    const opt = OTHERS_OPTIONS.find((o) => o.key === text.trim().charAt(0));
    if (!opt) { await msg.reply("Please reply with a number between *1* and *5*."); return; }
    session.answers.positioning = opt.label.toLowerCase();
    await runOnboardingPipeline(from, session);
    return;
  }

  if (session.phase === "choosing") {
    const keys = Object.keys(session.profiles);
    const idx = parseInt(lower.replace(/[^0-9]/g, "")) - 1;
    if (isNaN(idx) || idx < 0 || idx >= keys.length) {
      await msg.reply(`Please reply with a number between *1* and *${keys.length}*.`);
      return;
    }
    const chosen = session.profiles[keys[idx]];
    const profileData = {
      onboarded: true,
      onboarded_at: new Date().toISOString(),
      name: session.answers.name,
      brand_name: session.answers.brand_name,
      phone: from,
      craft_category: session.attrs?.category || "craft",
      materials: session.answers.materials,
      hours_per_piece: session.answers.hours,
      positioning: chosen.positioning,
      brand_statement: chosen.brand_statement,
      target_audience: chosen.target_audience,
      tone_of_voice: chosen.tone_of_voice,
      price_positioning: chosen.price_positioning,
      key_message: chosen.key_message,
      brand_history: [{ date: new Date().toISOString(), positioning: chosen.positioning, reason: "Initial onboarding" }]
    };
    saveProfile(from, profileData);
    appendProduct(from, {
      title: `First piece — ${session.attrs?.category || "handcrafted"}`,
      category: session.attrs?.category,
      materials: session.answers.materials,
      hours: session.answers.hours,
      positioning: chosen.positioning,
    });
    session.phase = "done";
    await client.sendMessage(from,
      `🎉 *${chosen.positioning.toUpperCase()} direction confirmed!*\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `🎯 *Brand Position*\n${chosen.brand_statement}\n\n` +
      `👤 *Your Audience*\n${chosen.target_audience}\n\n` +
      `🗣 *Tone of Voice*\n${chosen.tone_of_voice}\n\n` +
      `💰 *Price Positioning*\n${chosen.price_positioning}\n\n` +
      `✨ *Key Message*\n"${chosen.key_message}"\n\n` +
      `━━━━━━━━━━━━━━━\n\n` +
      `Your brand profile is saved, *${session.answers.name}*! 🌿\n\n` +
      `Whenever you make something new, just send me photos and I'll generate a full listing.\n\nType *menu* anytime.`
    );
    return;
  }

  if (session?.phase === "processing") { await msg.reply("⏳ Still working on it — almost there!"); return; }
  if (session?.phase === "done") {
    sessions[from] = { phase: "menu", profile: loadProfile(from) };
    await showMenu(from, loadProfile(from)?.name);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────
async function showMenu(from, name) {
  await client.sendMessage(from,
    `👋 Welcome back${name ? `, *${name}*` : ""}!\n\n` +
    `1️⃣  *New craft listing*\n2️⃣  *Update my brand*\n3️⃣  *View my profile*\n\n_Reply 1, 2, or 3_`
  );
}

async function handleListingPhoto(from, msg, session) {
  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      if (!media?.data) { await client.sendMessage(from, "⚠️ Couldn't read that photo. Try again."); return; }
      session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
      const n = session.photos.length;

      if (n < REQUIRED_PHOTOS.length) {
        await client.sendMessage(from, `✅ Photo ${n}/${REQUIRED_PHOTOS.length} received!\n\nNext: ${REQUIRED_PHOTOS[n].emoji} *${REQUIRED_PHOTOS[n].label}* _(required)_`);
      } else if (n - REQUIRED_PHOTOS.length < OPTIONAL_PHOTOS.length) {
        const optIdx = n - REQUIRED_PHOTOS.length;
        const next = OPTIONAL_PHOTOS[optIdx];
        await client.sendMessage(from,
          `✅ Photo ${n} received!\n\n${next.emoji} *${next.label}* _(optional)_\n\nSend a photo, or type *done* to continue.`
        );
      } else {
        session.phase = "listing_extra_photos";
        await client.sendMessage(from, "✅ *All photos received!*\n\nSend more close-ups if you like, then type *done*.\n\n_Or type *done* now._");
      }
    } catch { await client.sendMessage(from, "⚠️ Problem with that photo. Try again."); }
  } else {
    const n = session.photos ? session.photos.length : 0;
    if (n >= REQUIRED_PHOTOS.length) {
      // They typed instead of sending a photo — treat as skip/done for optional
      session.phase = "listing_extra_photos";
      await client.sendMessage(from, `✅ *${n} photo${n > 1 ? "s" : ""} received.*\n\nSend more close-ups if you like, then type *done*.\n\n_Or type *done* now._`);
    } else {
      await client.sendMessage(from,
        "📸 Please send at least *2 photos*:\n\n🔵 Front view _(required)_ · 🔴 Close-up _(required)_\n🟡 Side view _(optional)_ · 🟠 Back view _(optional)_\n\n_Send your front view first_"
      );
    }
  }
}

async function runOnboardingPipeline(from, session) {
  session.phase = "processing";
  await client.sendMessage(from, "✅ *All inputs received!*\n\n🔍 *Analysing your craft...*\n_About 20–30 seconds_");
  try {
    const attrs = await analysePhotos(session.photos);
    session.attrs = attrs;
    await client.sendMessage(from, `📦 *${attrs.category}* identified\n\n✍️ Generating your 3 brand profiles...`);
    const profiles = await generatePositioningProfiles(attrs, session.answers, session.workspacePhoto);
    session.profiles = profiles;
    session.phase = "choosing";
    const keys = Object.keys(profiles);
    let out = `🎨 *Your Brand Positioning Profiles*\n\nBased on your *${attrs.category}*:\n\n━━━━━━━━━━━━━━━\n\n`;
    keys.forEach((key, i) => {
      const p = profiles[key];
      out += `${i + 1}️⃣ *${p.positioning.toUpperCase()}*\n${p.brand_statement}\n\n👤 _${p.target_audience}_\n💰 ${p.price_positioning}\n✨ _"${p.key_message}"_\n\n━━━━━━━━━━━━━━━\n\n`;
    });
    out += `Which direction feels right?\nReply *1*, *2*, or *3*.`;
    await client.sendMessage(from, out);
  } catch (e) {
    console.error("Onboarding pipeline error:", e.message);
    session.phase = "photos";
    await client.sendMessage(from, `⚠️ Something went wrong: ${e.message.slice(0, 100)}\n\nType *restart* and try again.`);
  }
}

async function runListingPipeline(from, session) {
  session.phase = "processing";
  await client.sendMessage(from, "🔍 *Analysing your craft...*\n_Generating your full listing and product photo — about 30–45 seconds_");
  try {
    const attrs = await analysePhotos(session.photos);
    const listing = await generateListing(attrs, session.answers, session.profile);
    session.listing = { ...listing, attrs, materials: session.answers.materials, hours: session.answers.hours };

    // Send text listing first
    await client.sendMessage(from,
      `📦 *${listing.title}*\n\n━━━━━━━━━━━━━━━\n\n` +
      `📝 *Description*\n${listing.description}\n\n` +
      `🏷 *Etsy Tags*\n${listing.etsy_tags}\n\n` +
      `🛍 *Shopify Tags*\n${listing.shopify_tags}\n\n` +
      `💰 *Recommended Price:* ${listing.price_recommended}\n\n` +
      `📸 *Photo Tips*\n${listing.photo_direction}\n\n━━━━━━━━━━━━━━━`
    );

    // Generate and send product photo
    await client.sendMessage(from, "🎨 *Generating your e-commerce product photo...*");
    try {
      const { b64, prompt } = await generateProductPhoto(attrs, listing, session.profile);
      const { MessageMedia } = require("whatsapp-web.js");
      const media = new MessageMedia("image/png", b64, `${listing.title}.png`);
      await client.sendMessage(from, media, { caption: `✨ *AI-generated product photo*\n_Prompt: ${prompt.slice(0, 100)}..._` });
    } catch (imgErr) {
      console.error("Photo gen error:", imgErr.message);
      await client.sendMessage(from, "⚠️ Couldn't generate the product photo this time — but your listing is ready below.");
    }

    session.phase = "listing_confirm";
    await client.sendMessage(from, "Reply *Save* to record this listing, or tell me what to change. ✏️");

  } catch (e) {
    console.error("Listing error:", e.message);
    session.phase = "menu";
    await client.sendMessage(from, `⚠️ Something went wrong: ${e.message.slice(0, 100)}\n\nType *menu* to try again.`);
  }
}

async function runListingEdit(from, session) {
  try {
    const updated = await generateListing(session.listing.attrs, session.listing, session.profile, session.editFeedback);
    session.listing = { ...session.listing, ...updated };
    session.phase = "listing_confirm";
    await client.sendMessage(from,
      `✏️ *Updated Listing*\n\n📦 *${updated.title}*\n\n📝 ${updated.description}\n\n` +
      `🏷 *Etsy:* ${updated.etsy_tags}\n🛍 *Shopify:* ${updated.shopify_tags}\n💰 *Price:* ${updated.price_recommended}\n\n` +
      `Reply *Save* to record, or tell me what else to change.`
    );
  } catch {
    session.phase = "listing_confirm";
    await client.sendMessage(from, "⚠️ Couldn't apply edits — reply *Save* to keep the current version.");
  }
}

async function runBrandTweak(from, session, feedback) {
  session.tweakFeedback = feedback;
  await client.sendMessage(from, "✏️ Updating your brand positioning...");
  try {
    const updated = await generatePositioningProfiles(
      { category: session.profile.craft_category },
      { ...session.profile, tweak: feedback },
      null
    );
    session.updatedProfiles = updated;
    session.phase = "brand_tweak_choose";
    const keys = Object.keys(updated);
    let out = `🎨 *Refined Positioning Options*\n\n━━━━━━━━━━━━━━━\n\n`;
    keys.forEach((key, i) => {
      const p = updated[key];
      out += `${i + 1}️⃣ *${p.positioning.toUpperCase()}*\n${p.brand_statement}\n\n👤 _${p.target_audience}_\n💰 ${p.price_positioning}\n\n━━━━━━━━━━━━━━━\n\n`;
    });
    out += "Which feels right? Reply *1*, *2*, or *3*.";
    await client.sendMessage(from, out);
  } catch {
    session.phase = "menu";
    await client.sendMessage(from, "⚠️ Couldn't update positioning. Type *menu* to try again.");
  }
}

client.initialize();

//listing edit and brand onboarding
// require("dotenv").config();
// const { Client, LocalAuth } = require("whatsapp-web.js");
// const qrcode = require("qrcode-terminal");
// const fs = require("fs");
// const path = require("path");
// const { analysePhotos, generatePositioningProfiles, generateListing } = require("./photoAgent");

// const client = new Client({
//   authStrategy: new LocalAuth(),
//   puppeteer: {
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     headless: true,
//   },
//   webVersionCache: {
//     type: "remote",
//     remotePath:
//       "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
//   },
// });

// // ── Constants ──────────────────────────────────────────────────────────────
// const sessions = {};

// const REQUIRED_PHOTOS = [
//   { label: "front view",      emoji: "🔵" },
//   { label: "close-up detail", emoji: "🔴" },
// ];

// const OPTIONAL_PHOTOS = [
//   { label: "side view",  emoji: "🟡" },
//   { label: "back view",  emoji: "🟠" },
// ];

// const OTHERS_OPTIONS = [
//   { key: "1", label: "Eco / Sustainable" },
//   { key: "2", label: "Community / Local Craft" },
//   { key: "3", label: "Gift / Occasion-based" },
//   { key: "4", label: "Minimalist / Contemporary" },
//   { key: "5", label: "Spiritual / Wellness" },
// ];

// // ── Profile storage ────────────────────────────────────────────────────────
// const PROFILES_DIR = path.join(__dirname, "profiles");
// if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR);

// function safeId(from) { return from.replace(/[^0-9]/g, ""); }
// function profilePath(from) { return path.join(PROFILES_DIR, `${safeId(from)}.json`); }
// function productsPath(from) { return path.join(PROFILES_DIR, `${safeId(from)}_products.json`); }

// function loadProfile(from) {
//   try { return fs.existsSync(profilePath(from)) ? JSON.parse(fs.readFileSync(profilePath(from), "utf8")) : null; }
//   catch { return null; }
// }

// function saveProfile(from, data) {
//   fs.writeFileSync(profilePath(from), JSON.stringify(data, null, 2));
// }

// function appendProduct(from, product) {
//   let products = [];
//   try { if (fs.existsSync(productsPath(from))) products = JSON.parse(fs.readFileSync(productsPath(from), "utf8")); } catch {}
//   products.push({ ...product, date_listed: new Date().toISOString() });
//   fs.writeFileSync(productsPath(from), JSON.stringify(products, null, 2));
// }

// function getProducts(from) {
//   try { return fs.existsSync(productsPath(from)) ? JSON.parse(fs.readFileSync(productsPath(from), "utf8")) : []; }
//   catch { return []; }
// }

// // ── Client events ──────────────────────────────────────────────────────────
// client.on("qr", (qr) => { qrcode.generate(qr, { small: true }); console.log("📱 Scan QR → Linked Devices"); });
// client.on("ready", () => console.log("✅ WhatsApp bot ready!"));
// client.on("auth_failure", () => console.log("❌ Auth failed — delete .wwebjs_auth and retry"));

// // ── Message handler ────────────────────────────────────────────────────────
// client.on("message", async (msg) => {
//   if (msg.from.includes("@g.us")) return;

//   const from = msg.from;
//   const text = msg.body.trim();
//   const lower = text.toLowerCase();

//   // Hard reset
//   if (["restart", "/start"].includes(lower)) delete sessions[from];


//   // Full history wipe
//   if (["clear", "reset", "start over", "delete my data", "/reset", "/clear"].includes(lower)) {
//     sessions[from] = { phase: "confirm_clear" };
//     await msg.reply(
//       "⚠️ *Are you sure?*\n\n" +
//       "This will permanently delete:\n" +
//       "• Your brand profile\n" +
//       "• All saved product listings\n" +
//       "• Your onboarding history\n\n" +
//       "Type *DELETE* to confirm, or anything else to cancel."
//     );
//     return;
//   }

//   // Confirm clear
//   if (sessions[from]?.phase === "confirm_clear") {
//     if (text.trim() === "DELETE") {
//       try { if (fs.existsSync(profilePath(from))) fs.unlinkSync(profilePath(from)); } catch {}
//       try { if (fs.existsSync(productsPath(from))) fs.unlinkSync(productsPath(from)); } catch {}
//       delete sessions[from];
//       await msg.reply(
//         "🗑 *All your data has been deleted.*\n\n" +
//         "You're starting fresh — type *hi* whenever you're ready to begin again. 🌿"
//       );
//     } else {
//       delete sessions[from];
//       await msg.reply("👍 No changes made. Type *menu* to continue.");
//     }
//     return;
//   }
//   // "menu" shortcut for returning users
//   if (lower === "menu" && loadProfile(from)?.onboarded) {
//     sessions[from] = { phase: "menu", profile: loadProfile(from) };
//     await showMenu(from, sessions[from].profile.name);
//     return;
//   }

//   const profile = loadProfile(from);

//   // ── RETURNING USER — no active session ──
//   if (profile?.onboarded && !sessions[from]) {
//     sessions[from] = { phase: "menu", profile };
//     // If they sent a photo straight away, jump to listing
//     if (msg.hasMedia) {
//       sessions[from].phase = "listing_photos";
//       sessions[from].photos = [];
//       sessions[from].answers = {};
//       await handleListingPhoto(from, msg, sessions[from]);
//       return;
//     }
//     await showMenu(from, profile.name);
//     return;
//   }

//   const session = sessions[from];

//   // ── MENU ───────────────────────────────────────────────────────────────
//   if (session?.phase === "menu") {
//     if (msg.hasMedia) {
//       session.phase = "listing_photos";
//       session.photos = [];
//       session.answers = {};
//       await handleListingPhoto(from, msg, session);
//       return;
//     }
//     if (["1", "new", "listing"].includes(lower)) {
//       session.phase = "listing_photos";
//       session.photos = [];
//       session.answers = {};
//       await msg.reply(
//         "📸 *New Craft Listing*\n\n" +
//         "Please send at least *2 photos* of your piece:\n\n" +
//         "🔵 Photo 1 — *Front view* _(required)_\n" +
//         "🔴 Photo 2 — *Close-up detail* _(required)_\n" +
//         "🟡 Photo 3 — *Side view* _(optional)_\n" +
//         "🟠 Photo 4 — *Back view* _(optional)_\n\n" +
//         "_Send your front view first 📸_"
//       );
//       return;
//     }
//     if (["2", "brand", "update"].includes(lower)) {
//       session.phase = "brand_update_choice";
//       await msg.reply(
//         `🔄 *Update Brand Positioning*\n\n` +
//         `Your current positioning: *${session.profile.positioning?.toUpperCase()}*\n\n` +
//         `1️⃣  *Regenerate* — start fresh with 3 new profiles\n` +
//         `2️⃣  *Tweak* — adjust your current positioning\n\n_Reply 1 or 2_`
//       );
//       return;
//     }
//     if (["3", "profile", "view"].includes(lower)) {
//       const products = getProducts(from);
//       await msg.reply(
//         `🎨 *Your Brand Profile*\n\n` +
//         `*Name:* ${session.profile.name}\n` +
//         `*Brand:* ${session.profile.brand_name}\n` +
//         `*Positioning:* ${session.profile.positioning?.toUpperCase()}\n\n` +
//         `_${session.profile.brand_statement}_\n\n` +
//         `👤 *Customer:* ${session.profile.target_audience}\n` +
//         `🗣 *Tone:* ${session.profile.tone_of_voice}\n` +
//         `💰 *Price tier:* ${session.profile.price_positioning}\n` +
//         `✨ *Key message:* "${session.profile.key_message}"\n\n` +
//         `📦 *Products listed:* ${products.length}\n` +
//         `🗓 *Member since:* ${new Date(session.profile.onboarded_at).toLocaleDateString("en-GB")}\n\n` +
//         `_Reply *menu* to go back_`
//       );
//       return;
//     }
//     await msg.reply("Please reply with *1*, *2*, or *3* to choose an option. 🌿");
//     return;
//   }

//   // ── LISTING PHOTOS ─────────────────────────────────────────────────────
//   if (session?.phase === "listing_photos") {
//     await handleListingPhoto(from, msg, session);
//     return;
//   }

//   // ── LISTING EXTRA PHOTOS ───────────────────────────────────────────────
//   if (session?.phase === "listing_extra_photos") {
//     if (msg.hasMedia) {
//       try {
//         const media = await msg.downloadMedia();
//         if (media?.data) {
//           session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
//           const extras = session.photos.filter((_, i) => i >= REQUIRED_PHOTOS.length + OPTIONAL_PHOTOS.length).length;
//           await msg.reply(`✅ Extra close-up ${extras} added! Send another, or type *done*.`);
//         }
//       } catch { await msg.reply("⚠️ Problem with that photo. Try again."); }
//       return;
//     }
//     if (["done", "next", "continue"].includes(lower)) {
//       session.phase = "listing_q1";
//       await msg.reply("⏱ *How many hours did this piece take?*\n\n_e.g._ *4* _or_ *0.5*");
//     } else {
//       await msg.reply("Send another close-up, or type *done* to continue. 📸");
//     }
//     return;
//   }

//   // ── LISTING Q1 ─────────────────────────────────────────────────────────
//   if (session?.phase === "listing_q1") {
//     const hours = parseFloat(text.replace(/[^0-9.]/g, ""));
//     if (isNaN(hours) || hours <= 0) { await msg.reply("Please enter a number, e.g. *3* ⏱"); return; }
//     session.answers.hours = hours;
//     session.phase = "listing_q2";
//     await msg.reply("🪡 *What materials did you use?*\n\n_e.g. hand-dyed silk, reclaimed oak_");
//     return;
//   }

//   // ── LISTING Q2 ─────────────────────────────────────────────────────────
//   if (session?.phase === "listing_q2") {
//     if (text.length < 3) { await msg.reply("Could you describe the materials in more detail? 🪡"); return; }
//     session.answers.materials = text;
//     session.phase = "listing_q3";
//     await msg.reply(
//       "💰 *What price are you thinking?*\n\n" +
//       "_Optional — type a number or *skip* and I'll suggest a price_"
//     );
//     return;
//   }

//   // ── LISTING Q3 ─────────────────────────────────────────────────────────
//   if (session?.phase === "listing_q3") {
//     if (!["skip", "s"].includes(lower)) {
//       const price = parseFloat(text.replace(/[^0-9.]/g, ""));
//       if (!isNaN(price) && price > 0) session.answers.price = price;
//     }
//     await runListingPipeline(from, session);
//     return;
//   }

//   // ── LISTING CONFIRM ────────────────────────────────────────────────────
//   if (session?.phase === "listing_confirm") {
//     if (["save", "yes", "y"].includes(lower)) {
//       appendProduct(from, session.listing);
//       session.phase = "menu";
//       await msg.reply("✅ *Listing saved!*\n\nSend more photos anytime to create another listing, or type *menu*. 🌿");
//     } else {
//       session.editFeedback = text;
//       session.phase = "listing_edit";
//       await runListingEdit(from, session);
//     }
//     return;
//   }

//   // ── LISTING EDIT ───────────────────────────────────────────────────────
//   if (session?.phase === "listing_edit") {
//     session.editFeedback = text;
//     await runListingEdit(from, session);
//     return;
//   }

//   // ── BRAND UPDATE ───────────────────────────────────────────────────────
//   if (session?.phase === "brand_update_choice") {
//     if (text === "1") {
//       session.phase = "brand_regen_photos";
//       session.photos = [];
//       await msg.reply(
//         "📸 Send photos of your latest piece:\n\n🔵 Front view _(required)_ · 🔴 Close-up _(required)_\n🟡 Side view _(optional)_ · 🟠 Back view _(optional)_\n\n_Send your front view first_"
//       );
//     } else if (text === "2") {
//       session.phase = "brand_tweak";
//       await msg.reply("✏️ What feels off about your current positioning? Tell me in your own words.");
//     } else {
//       await msg.reply("Reply *1* to regenerate or *2* to tweak.");
//     }
//     return;
//   }

//   if (session?.phase === "brand_tweak") {
//     await runBrandTweak(from, session, text);
//     return;
//   }

//   if (session?.phase === "brand_tweak_choose") {
//     const keys = Object.keys(session.updatedProfiles);
//     const idx = parseInt(lower.replace(/[^0-9]/g, "")) - 1;
//     if (isNaN(idx) || idx < 0 || idx >= keys.length) {
//       await msg.reply("Please reply with *1*, *2*, or *3*.");
//       return;
//     }
//     const chosen = session.updatedProfiles[keys[idx]];
//     const updatedProfile = { ...session.profile, ...chosen,
//       brand_history: [...(session.profile.brand_history || []), {
//         date: new Date().toISOString(),
//         positioning: chosen.positioning,
//         brand_statement: chosen.brand_statement,
//         reason: session.tweakFeedback || "User-initiated update"
//       }]
//     };
//     saveProfile(from, updatedProfile);
//     session.profile = updatedProfile;
//     session.phase = "menu";
//     await msg.reply(
//       `✅ *Brand updated!*\n\n*${chosen.positioning.toUpperCase()}*\n${chosen.brand_statement}\n\n` +
//       `All future listings will reflect your new direction. 🌿\n\nType *menu* to continue.`
//     );
//     return;
//   }

//   // ── NEW SESSION → ONBOARDING ───────────────────────────────────────────
//   if (!sessions[from]) {
//     sessions[from] = { phase: "consent", photos: [], answers: {} };
//     await msg.reply(
//       "👋 *Welcome to Artisan Agent!*\n\n" +
//       "I help craftspeople discover the right brand positioning — so you can sell with clarity and confidence.\n\n" +
//       "Here's what we'll do:\n" +
//       "1️⃣  Send at least 2 photos of your craft (front + close-up)\n" +
//       "2️⃣  Answer a few quick questions\n" +
//       "3️⃣  Receive your personalised brand direction\n\n" +
//       "📋 _Your photos are used only to generate your brand profile and are not stored._\n\n" +
//       "Type *Yes* to begin, or *No* to exit."
//     );
//     return;
//   }

//   // ── ONBOARDING PHASES ──────────────────────────────────────────────────
//   if (session.phase === "consent") {
//     if (["yes", "y", "sure", "ok", "okay"].includes(lower)) {
//       session.phase = "ask_name";
//       await msg.reply("✨ Let's go!\n\nFirst — *what's your name?* 🙏");
//     } else if (["no", "n", "nope", "exit"].includes(lower)) {
//       await msg.reply("No problem! Come back whenever you're ready. 🌿");
//       delete sessions[from];
//     } else {
//       await msg.reply("Please type *Yes* to begin or *No* to exit.");
//     }
//     return;
//   }

//   if (session.phase === "ask_name") {
//     if (text.length < 2) { await msg.reply("Could you share your name? 🙏"); return; }
//     session.answers.name = text;
//     session.phase = "ask_brand";
//     await msg.reply(`Lovely to meet you, *${text}*! 🌿\n\nAnd what's the name of your *brand*?`);
//     return;
//   }

//   if (session.phase === "ask_brand") {
//     if (text.length < 2) { await msg.reply("Could you share your brand name? 🏷"); return; }
//     session.answers.brand_name = text;
//     session.phase = "photos";
//     await msg.reply(
//       `✨ *${text}* — beautiful!\n\n` +
//       "📸 *Step 1 — Photos*\n\n" +
//       "Please send at least *2 photos* of your product:\n\n" +
//       "🔵 Photo 1 — *Front view* _(required)_\n" +
//       "🔴 Photo 2 — *Close-up detail* _(required)_\n" +
//       "🟡 Photo 3 — *Side view* _(optional)_\n" +
//       "🟠 Photo 4 — *Back view* _(optional)_\n\n" +
//       "_Send your front view first 📸_"
//     );
//     return;
//   }

//   if (session.phase === "photos") {
//     if (msg.hasMedia) {
//       try {
//         const media = await msg.downloadMedia();
//         if (!media?.data) { await msg.reply("⚠️ Couldn't read that photo. Please try again."); return; }
//         session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
//         const n = session.photos.length;

//         if (n < REQUIRED_PHOTOS.length) {
//           // Still need required photos
//           await msg.reply(`✅ Photo ${n}/${REQUIRED_PHOTOS.length} received!\n\nNext: ${REQUIRED_PHOTOS[n].emoji} *${REQUIRED_PHOTOS[n].label}* _(required)_`);
//         } else if (n - REQUIRED_PHOTOS.length < OPTIONAL_PHOTOS.length) {
//           // Required done — prompt optional one at a time
//           const optIdx = n - REQUIRED_PHOTOS.length;
//           const next = OPTIONAL_PHOTOS[optIdx];
//           await msg.reply(
//             `✅ Photo ${n} received!\n\n` +
//             `${next.emoji} *${next.label}* _(optional)_\n\nSend a photo, or type *done* to continue.`
//           );
//         } else {
//           // All 4 collected
//           session.phase = "extra_photos";
//           await msg.reply(
//             "✅ *All photos received!*\n\n" +
//             "Would you like to add more close-up detail photos? Send as many as you'd like, then type *done*.\n\n_Or type *done* now._"
//           );
//         }
//       } catch { await msg.reply("⚠️ Problem with that photo. Please try again."); }
//     } else {
//       const n = session.photos.length;
//       if (n < REQUIRED_PHOTOS.length) {
//         await msg.reply(
//           n === 0
//             ? `Please send your front view — ${REQUIRED_PHOTOS[0].emoji} *${REQUIRED_PHOTOS[0].label}* 📸`
//             : `Got ${n}/${REQUIRED_PHOTOS.length} required photos. Next: ${REQUIRED_PHOTOS[n].emoji} *${REQUIRED_PHOTOS[n].label}*`
//         );
//       } else if (["done", "next", "continue", "skip"].includes(lower)) {
//         // Skip remaining optional photos
//         session.phase = "extra_photos";
//         await msg.reply(
//           `✅ *${n} photo${n > 1 ? "s" : ""} received.*\n\n` +
//           "Would you like to add more close-up detail photos? Send as many as you'd like, then type *done*.\n\n_Or type *done* now._"
//         );
//       } else {
//         const optIdx = n - REQUIRED_PHOTOS.length;
//         const next = OPTIONAL_PHOTOS[optIdx];
//         await msg.reply(`${next.emoji} *${next.label}* _(optional)_ — send a photo, or type *done* to skip.`);
//       }
//     }
//     return;
//   }

//   if (session.phase === "extra_photos") {
//     if (msg.hasMedia) {
//       try {
//         const media = await msg.downloadMedia();
//         if (media?.data) {
//           session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
//           await msg.reply(`✅ Extra close-up ${session.photos.length - REQUIRED_PHOTOS.length} added! Send another, or type *done*.`);
//         }
//       } catch { await msg.reply("⚠️ Problem with that photo. Try again."); }
//       return;
//     }
//     if (["done", "next", "continue"].includes(lower)) {
//       session.phase = "workspace_photo";
//       await msg.reply(
//         `✅ *${session.photos.length} photos total.*\n\n` +
//         "🛠 *One more — your world as a maker*\n\n" +
//         "Send a photo of your *tools*, *workspace*, or *hands at work*.\n\n" +
//         "_Or type *skip* to continue._"
//       );
//     } else {
//       await msg.reply("Send another close-up, or type *done* to continue. 📸");
//     }
//     return;
//   }

//   if (session.phase === "workspace_photo") {
//     if (msg.hasMedia) {
//       try {
//         const media = await msg.downloadMedia();
//         if (media?.data) session.workspacePhoto = { b64: media.data, type: media.mimetype || "image/jpeg" };
//       } catch {}
//       session.phase = "q1";
//       await msg.reply("✅ *Lovely — your maker story is captured.*\n\n*Question 1*\n⏱ How many hours to make this piece?\n\n_e.g._ *4* _or_ *0.5*");
//       return;
//     }
//     if (["skip", "no", "next"].includes(lower)) {
//       session.workspacePhoto = null;
//       session.phase = "q1";
//       await msg.reply("No problem!\n\n*Question 1*\n⏱ How many hours to make this piece?\n\n_e.g._ *4* _or_ *0.5*");
//       return;
//     }
//     await msg.reply("Send a photo of your workspace or tools — or type *skip*. 📸");
//     return;
//   }

//   if (session.phase === "q1") {
//     const hours = parseFloat(text.replace(/[^0-9.]/g, ""));
//     if (isNaN(hours) || hours <= 0) { await msg.reply("Please enter a number, e.g. *3* ⏱"); return; }
//     session.answers.hours = hours;
//     session.phase = "q2";
//     await msg.reply("✅ Got it!\n\n*Question 2*\n🪡 What materials did you use?\n\n_e.g. stoneware clay with natural ash glaze_");
//     return;
//   }

//   if (session.phase === "q2") {
//     if (text.length < 3) { await msg.reply("Could you describe the materials in more detail? 🪡"); return; }
//     session.answers.materials = text;
//     session.phase = "q3";
//     await msg.reply(
//       "✅ Lovely!\n\n*Question 3*\n🎯 How do you want to position your work?\n\n" +
//       "*A* — 🏆 *Luxury* — _Premium, exclusive, investment piece_\n\n" +
//       "*B* — 🏛 *Heritage* — _Tradition, cultural roots, generational craft_\n\n" +
//       "*C* — 🛍 *Everyday* — _Accessible, functional, e-commerce ready_\n\n" +
//       "*D* — 🌐 *Other direction*\n\n_Reply A, B, C, or D_"
//     );
//     return;
//   }

//   if (session.phase === "q3") {
//     const map = { a: "luxury", b: "heritage", c: "everyday" };
//     const choice = lower.replace(/[^a-d]/g, "").charAt(0);
//     if (map[choice]) {
//       session.answers.positioning = map[choice];
//       await runOnboardingPipeline(from, session);
//     } else if (choice === "d") {
//       session.phase = "q3_others";
//       await msg.reply(
//         "Which direction resonates most?\n\n" +
//         OTHERS_OPTIONS.map((o) => `*${o.key}* — ${o.label}`).join("\n") +
//         "\n\n_Reply 1–5_"
//       );
//     } else {
//       await msg.reply("Please reply with *A*, *B*, *C*, or *D*.");
//     }
//     return;
//   }

//   if (session.phase === "q3_others") {
//     const opt = OTHERS_OPTIONS.find((o) => o.key === text.trim().charAt(0));
//     if (!opt) { await msg.reply("Please reply with a number between *1* and *5*."); return; }
//     session.answers.positioning = opt.label.toLowerCase();
//     await runOnboardingPipeline(from, session);
//     return;
//   }

//   if (session.phase === "choosing") {
//     const keys = Object.keys(session.profiles);
//     const idx = parseInt(lower.replace(/[^0-9]/g, "")) - 1;
//     if (isNaN(idx) || idx < 0 || idx >= keys.length) {
//       await msg.reply(`Please reply with a number between *1* and *${keys.length}*.`);
//       return;
//     }
//     const chosen = session.profiles[keys[idx]];
//     const profileData = {
//       onboarded: true,
//       onboarded_at: new Date().toISOString(),
//       name: session.answers.name,
//       brand_name: session.answers.brand_name,
//       phone: from,
//       craft_category: session.attrs?.category || "craft",
//       materials: session.answers.materials,
//       hours_per_piece: session.answers.hours,
//       positioning: chosen.positioning,
//       brand_statement: chosen.brand_statement,
//       target_audience: chosen.target_audience,
//       tone_of_voice: chosen.tone_of_voice,
//       price_positioning: chosen.price_positioning,
//       key_message: chosen.key_message,
//       brand_history: [{ date: new Date().toISOString(), positioning: chosen.positioning, reason: "Initial onboarding" }]
//     };
//     saveProfile(from, profileData);
//     appendProduct(from, {
//       title: `First piece — ${session.attrs?.category || "handcrafted"}`,
//       category: session.attrs?.category,
//       materials: session.answers.materials,
//       hours: session.answers.hours,
//       positioning: chosen.positioning,
//     });
//     session.phase = "done";
//     await client.sendMessage(from,
//       `🎉 *${chosen.positioning.toUpperCase()} direction confirmed!*\n\n` +
//       `━━━━━━━━━━━━━━━\n\n` +
//       `🎯 *Brand Position*\n${chosen.brand_statement}\n\n` +
//       `👤 *Your Audience*\n${chosen.target_audience}\n\n` +
//       `🗣 *Tone of Voice*\n${chosen.tone_of_voice}\n\n` +
//       `💰 *Price Positioning*\n${chosen.price_positioning}\n\n` +
//       `✨ *Key Message*\n"${chosen.key_message}"\n\n` +
//       `━━━━━━━━━━━━━━━\n\n` +
//       `Your brand profile is saved, *${session.answers.name}*! 🌿\n\n` +
//       `Whenever you make something new, just send me photos and I'll generate a full listing.\n\nType *menu* anytime.`
//     );
//     return;
//   }

//   if (session?.phase === "processing") { await msg.reply("⏳ Still working on it — almost there!"); return; }
//   if (session?.phase === "done") {
//     sessions[from] = { phase: "menu", profile: loadProfile(from) };
//     await showMenu(from, loadProfile(from)?.name);
//   }
// });

// // ── Helpers ────────────────────────────────────────────────────────────────
// async function showMenu(from, name) {
//   await client.sendMessage(from,
//     `👋 Welcome back${name ? `, *${name}*` : ""}!\n\n` +
//     `1️⃣  *New craft listing*\n2️⃣  *Update my brand*\n3️⃣  *View my profile*\n\n_Reply 1, 2, or 3_`
//   );
// }

// async function handleListingPhoto(from, msg, session) {
//   if (msg.hasMedia) {
//     try {
//       const media = await msg.downloadMedia();
//       if (!media?.data) { await client.sendMessage(from, "⚠️ Couldn't read that photo. Try again."); return; }
//       session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
//       const n = session.photos.length;

//       if (n < REQUIRED_PHOTOS.length) {
//         await client.sendMessage(from, `✅ Photo ${n}/${REQUIRED_PHOTOS.length} received!\n\nNext: ${REQUIRED_PHOTOS[n].emoji} *${REQUIRED_PHOTOS[n].label}* _(required)_`);
//       } else if (n - REQUIRED_PHOTOS.length < OPTIONAL_PHOTOS.length) {
//         const optIdx = n - REQUIRED_PHOTOS.length;
//         const next = OPTIONAL_PHOTOS[optIdx];
//         await client.sendMessage(from,
//           `✅ Photo ${n} received!\n\n${next.emoji} *${next.label}* _(optional)_\n\nSend a photo, or type *done* to continue.`
//         );
//       } else {
//         session.phase = "listing_extra_photos";
//         await client.sendMessage(from, "✅ *All photos received!*\n\nSend more close-ups if you like, then type *done*.\n\n_Or type *done* now._");
//       }
//     } catch { await client.sendMessage(from, "⚠️ Problem with that photo. Try again."); }
//   } else {
//     const n = session.photos ? session.photos.length : 0;
//     if (n >= REQUIRED_PHOTOS.length) {
//       // They typed instead of sending a photo — treat as skip/done for optional
//       session.phase = "listing_extra_photos";
//       await client.sendMessage(from, `✅ *${n} photo${n > 1 ? "s" : ""} received.*\n\nSend more close-ups if you like, then type *done*.\n\n_Or type *done* now._`);
//     } else {
//       await client.sendMessage(from,
//         "📸 Please send at least *2 photos*:\n\n🔵 Front view _(required)_ · 🔴 Close-up _(required)_\n🟡 Side view _(optional)_ · 🟠 Back view _(optional)_\n\n_Send your front view first_"
//       );
//     }
//   }
// }

// async function runOnboardingPipeline(from, session) {
//   session.phase = "processing";
//   await client.sendMessage(from, "✅ *All inputs received!*\n\n🔍 *Analysing your craft...*\n_About 20–30 seconds_");
//   try {
//     const attrs = await analysePhotos(session.photos);
//     session.attrs = attrs;
//     await client.sendMessage(from, `📦 *${attrs.category}* identified\n\n✍️ Generating your 3 brand profiles...`);
//     const profiles = await generatePositioningProfiles(attrs, session.answers, session.workspacePhoto);
//     session.profiles = profiles;
//     session.phase = "choosing";
//     const keys = Object.keys(profiles);
//     let out = `🎨 *Your Brand Positioning Profiles*\n\nBased on your *${attrs.category}*:\n\n━━━━━━━━━━━━━━━\n\n`;
//     keys.forEach((key, i) => {
//       const p = profiles[key];
//       out += `${i + 1}️⃣ *${p.positioning.toUpperCase()}*\n${p.brand_statement}\n\n👤 _${p.target_audience}_\n💰 ${p.price_positioning}\n✨ _"${p.key_message}"_\n\n━━━━━━━━━━━━━━━\n\n`;
//     });
//     out += `Which direction feels right?\nReply *1*, *2*, or *3*.`;
//     await client.sendMessage(from, out);
//   } catch (e) {
//     console.error("Onboarding pipeline error:", e.message);
//     session.phase = "photos";
//     await client.sendMessage(from, `⚠️ Something went wrong: ${e.message.slice(0, 100)}\n\nType *restart* and try again.`);
//   }
// }

// async function runListingPipeline(from, session) {
//   session.phase = "processing";
//   await client.sendMessage(from, "🔍 *Analysing your craft...*\n_Generating your full listing — about 20–30 seconds_");
//   try {
//     const attrs = await analysePhotos(session.photos);
//     const listing = await generateListing(attrs, session.answers, session.profile);
//     session.listing = { ...listing, attrs, materials: session.answers.materials, hours: session.answers.hours };
//     session.phase = "listing_confirm";
//     await client.sendMessage(from,
//       `📦 *${listing.title}*\n\n━━━━━━━━━━━━━━━\n\n` +
//       `📝 *Description*\n${listing.description}\n\n` +
//       `🏷 *Etsy Tags*\n${listing.etsy_tags}\n\n` +
//       `🛍 *Shopify Tags*\n${listing.shopify_tags}\n\n` +
//       `💰 *Recommended Price:* ${listing.price_recommended}\n\n` +
//       `📸 *Photo Tips*\n${listing.photo_direction}\n\n━━━━━━━━━━━━━━━\n\n` +
//       `Reply *Save* to record this listing, or tell me what to change. ✏️`
//     );
//   } catch (e) {
//     console.error("Listing error:", e.message);
//     session.phase = "menu";
//     await client.sendMessage(from, `⚠️ Something went wrong: ${e.message.slice(0, 100)}\n\nType *menu* to try again.`);
//   }
// }

// async function runListingEdit(from, session) {
//   try {
//     const updated = await generateListing(session.listing.attrs, session.listing, session.profile, session.editFeedback);
//     session.listing = { ...session.listing, ...updated };
//     session.phase = "listing_confirm";
//     await client.sendMessage(from,
//       `✏️ *Updated Listing*\n\n📦 *${updated.title}*\n\n📝 ${updated.description}\n\n` +
//       `🏷 *Etsy:* ${updated.etsy_tags}\n🛍 *Shopify:* ${updated.shopify_tags}\n💰 *Price:* ${updated.price_recommended}\n\n` +
//       `Reply *Save* to record, or tell me what else to change.`
//     );
//   } catch {
//     session.phase = "listing_confirm";
//     await client.sendMessage(from, "⚠️ Couldn't apply edits — reply *Save* to keep the current version.");
//   }
// }

// async function runBrandTweak(from, session, feedback) {
//   session.tweakFeedback = feedback;
//   await client.sendMessage(from, "✏️ Updating your brand positioning...");
//   try {
//     const updated = await generatePositioningProfiles(
//       { category: session.profile.craft_category },
//       { ...session.profile, tweak: feedback },
//       null
//     );
//     session.updatedProfiles = updated;
//     session.phase = "brand_tweak_choose";
//     const keys = Object.keys(updated);
//     let out = `🎨 *Refined Positioning Options*\n\n━━━━━━━━━━━━━━━\n\n`;
//     keys.forEach((key, i) => {
//       const p = updated[key];
//       out += `${i + 1}️⃣ *${p.positioning.toUpperCase()}*\n${p.brand_statement}\n\n👤 _${p.target_audience}_\n💰 ${p.price_positioning}\n\n━━━━━━━━━━━━━━━\n\n`;
//     });
//     out += "Which feels right? Reply *1*, *2*, or *3*.";
//     await client.sendMessage(from, out);
//   } catch {
//     session.phase = "menu";
//     await client.sendMessage(from, "⚠️ Couldn't update positioning. Type *menu* to try again.");
//   }
// }

// client.initialize();

// version: 1.1
// require("dotenv").config();
// const { Client, LocalAuth } = require("whatsapp-web.js");
// const qrcode = require("qrcode-terminal");
// const { analysePhotos, generatePositioningProfiles } = require("./photoAgent");

// const client = new Client({
//   authStrategy: new LocalAuth(),
//   puppeteer: {
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//     headless: true,
//   },
//   webVersionCache: {
//     type: "remote",
//     remotePath:
//       "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
//   },
// });

// // ── Constants ──────────────────────────────────────────────────────────────
// const sessions = {};

// const REQUIRED_PHOTOS = [
//   { label: "front view",        emoji: "🔵" },
//   { label: "side view",         emoji: "🟡" },
//   { label: "back view",         emoji: "🟠" },
//   { label: "close-up detail",   emoji: "🔴" },
// ];

// const OTHERS_OPTIONS = [
//   { key: "1", label: "Eco / Sustainable" },
//   { key: "2", label: "Community / Local Craft" },
//   { key: "3", label: "Gift / Occasion-based" },
//   { key: "4", label: "Minimalist / Contemporary" },
//   { key: "5", label: "Spiritual / Wellness" },
// ];

// // ── Client events ──────────────────────────────────────────────────────────
// client.on("qr", (qr) => {
//   qrcode.generate(qr, { small: true });
//   console.log("📱 Scan this QR with WhatsApp → Linked Devices");
// });
// client.on("ready", () => console.log("✅ WhatsApp bot ready!"));
// client.on("auth_failure", () =>
//   console.log("❌ Auth failed — delete .wwebjs_auth and retry")
// );

// // ── Message handler ────────────────────────────────────────────────────────
// client.on("message", async (msg) => {
//   if (msg.from.includes("@g.us")) return;

//   const from = msg.from;
//   const text = msg.body.trim();
//   const lower = text.toLowerCase();

//   // ── Hard reset ──
//   if (["hi", "hello", "start", "restart", "/start"].includes(lower)) {
//     delete sessions[from];
//   }

//   // ── New session → Step 1: Welcome + Consent ──
//   if (!sessions[from]) {
//     sessions[from] = { phase: "consent", photos: [], answers: {} };
//     await msg.reply(
//       "👋 *Welcome to Artisan Agent!*\n\n" +
//         "I help craftspeople discover the right brand positioning for their work — " +
//         "so you can sell with clarity and confidence.\n\n" +
//         "Here's what we'll do together:\n" +
//         "1️⃣  Send 4 photos of your craft\n" +
//         "2️⃣  Answer 3 quick questions\n" +
//         "3️⃣  Receive your personalised brand direction\n\n" +
//         "📋 *Your photos are used only to generate your brand profile and are not stored.*\n\n" +
//         "Type *Yes* to begin, or *No* to exit."
//     );
//     return;
//   }

//   const session = sessions[from];

//   // ── CONSENT ───────────────────────────────────────────────────────────
//   if (session.phase === "consent") {
//     if (["yes", "y", "sure", "ok", "okay"].includes(lower)) {
//       session.phase = "photos";
//       await msg.reply(
//         "✨ Let's go!\n\n" +
//           "📸 *Step 1 of 2 — Photos*\n\n" +
//           "Please send *4 photos* of your product:\n\n" +
//           "🔵 Photo 1 — *Front view*\n" +
//           "🟡 Photo 2 — *Side view*\n" +
//           "🟠 Photo 3 — *Back view*\n" +
//           "🔴 Photo 4 — *Close-up detail*\n\n" +
//           "_Send your first photo now — front view 🔵_"
//       );
//     } else if (["no", "n", "nope", "exit"].includes(lower)) {
//       await msg.reply(
//         "No problem at all! Come back whenever you're ready. 🌿"
//       );
//       delete sessions[from];
//     } else {
//       await msg.reply("Please type *Yes* to begin or *No* to exit.");
//     }
//     return;
//   }

//   // ── PHOTOS (required 4) ───────────────────────────────────────────────
//   if (session.phase === "photos") {
//     if (msg.hasMedia) {
//       try {
//         const media = await msg.downloadMedia();
//         if (!media?.data) {
//           await msg.reply("⚠️ Couldn't read that photo. Please try sending it again.");
//           return;
//         }

//         session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
//         const n = session.photos.length;

//         if (n < REQUIRED_PHOTOS.length) {
//           const next = REQUIRED_PHOTOS[n];
//           await msg.reply(
//             `✅ Photo ${n}/${REQUIRED_PHOTOS.length} received!\n\n` +
//               `Next: ${next.emoji} *${next.label}*`
//           );
//         } else {
//           // All 4 required photos collected → ask about extra close-ups
//           session.phase = "extra_photos";
//           await msg.reply(
//             "✅ *All 4 photos received!*\n\n" +
//               "Would you like to add more *close-up detail* photos?\n" +
//               "Extra close-ups help capture textures, stitching, glaze, or any special finishing details.\n\n" +
//               "📎 Send as many as you'd like, then type *done* when finished.\n" +
//               "_Or type *done* now to continue._"
//           );
//         }
//       } catch (e) {
//         console.error("Photo error:", e.message);
//         await msg.reply("⚠️ Problem with that photo. Please try again.");
//       }
//     } else {
//       const n = session.photos.length;
//       const next = REQUIRED_PHOTOS[n] || REQUIRED_PHOTOS[0];
//       await msg.reply(
//         n === 0
//           ? `Please send your first photo — ${REQUIRED_PHOTOS[0].emoji} *${REQUIRED_PHOTOS[0].label}* 📸`
//           : `Got ${n}/${REQUIRED_PHOTOS.length} photos. Next: ${next.emoji} *${next.label}*`
//       );
//     }
//     return;
//   }

//   // ── EXTRA CLOSE-UPS (optional) ───────────────────────────────────────
//   if (session.phase === "extra_photos") {
//     if (msg.hasMedia) {
//       try {
//         const media = await msg.downloadMedia();
//         if (!media?.data) {
//           await msg.reply("⚠️ Couldn't read that photo. Please try sending it again.");
//           return;
//         }
//         session.photos.push({ b64: media.data, type: media.mimetype || "image/jpeg" });
//         const extras = session.photos.length - REQUIRED_PHOTOS.length;
//         await msg.reply(
//           `✅ Extra close-up ${extras} added! Send another, or type *done* to continue.`
//         );
//       } catch (e) {
//         console.error("Photo error:", e.message);
//         await msg.reply("⚠️ Problem with that photo. Please try again.");
//       }
//       return;
//     }

//     if (lower.includes("done") || lower.includes("next") || lower.includes("continue")) {
//       const total = session.photos.length;
//       const extras = total - REQUIRED_PHOTOS.length;
//       session.phase = "workspace_photo";
//       await msg.reply(
//         `✅ *${total} photo${total > 1 ? "s" : ""} total* (${extras > 0 ? `+${extras} close-up${extras > 1 ? "s" : ""}` : "no extras"}).\n\n` +
//           "🛠 *One more photo — your world as a maker*\n\n" +
//           "Send a photo of any of the following:\n\n" +
//           "🔨 Your *tools* or materials\n" +
//           "🏡 Your *workspace* or studio\n" +
//           "🤲 Your *hands at work* or mid-process\n\n" +
//           "This helps us capture the human story behind your craft — " +
//           "it's what makes buyers connect with the maker, not just the product.\n\n" +
//           "_Send a photo, or type *skip* to continue without one._"
//       );
//       return;
//     }

//     await msg.reply(
//       "Send another close-up photo, or type *done* to move on. 📸"
//     );
//     return;
//   }

//   // ── WORKSPACE PHOTO (optional) ────────────────────────────────────────
//   if (session.phase === "workspace_photo") {
//     if (msg.hasMedia) {
//       try {
//         const media = await msg.downloadMedia();
//         if (!media?.data) {
//           await msg.reply("⚠️ Couldn't read that photo. Please try again.");
//           return;
//         }
//         session.workspacePhoto = { b64: media.data, type: media.mimetype || "image/jpeg" };
//         session.phase = "q1";
//         await msg.reply(
//           "✅ *Lovely — your maker story is captured.*\n\n" +
//             "📝 *Step 2 of 2 — 3 Quick Questions*\n\n" +
//             "*Question 1 of 3*\n" +
//             "⏱ How many hours does it take you to make this piece?\n\n" +
//             "_Reply with a number, e.g._ *4* _or_ *0.5*"
//         );
//       } catch (e) {
//         console.error("Workspace photo error:", e.message);
//         await msg.reply("⚠️ Problem with that photo. Please try again, or type *skip*.");
//       }
//       return;
//     }

//     if (lower.includes("skip") || lower.includes("no") || lower.includes("next")) {
//       session.workspacePhoto = null;
//       session.phase = "q1";
//       await msg.reply(
//         "No problem — you can always add one later.\n\n" +
//           "📝 *Step 2 of 2 — 3 Quick Questions*\n\n" +
//           "*Question 1 of 3*\n" +
//           "⏱ How many hours does it take you to make this piece?\n\n" +
//           "_Reply with a number, e.g._ *4* _or_ *0.5*"
//       );
//       return;
//     }

//     await msg.reply(
//       "Please send a photo of your workspace, tools, or process — or type *skip* to continue. 📸"
//     );
//     return;
//   }


//   if (session.phase === "q1") {
//     const hours = parseFloat(text.replace(/[^0-9.]/g, ""));
//     if (isNaN(hours) || hours <= 0) {
//       await msg.reply(
//         "Please enter the number of hours as a number, e.g. *3* or *0.5* ⏱"
//       );
//       return;
//     }
//     session.answers.hours = hours;
//     session.phase = "q2";
//     await msg.reply(
//       "✅ Got it!\n\n" +
//         "*Question 2 of 3*\n" +
//         "🪡 What materials did you use to make this?\n\n" +
//         "_e.g. stoneware clay with natural ash glaze, or hand-dyed silk thread_"
//     );
//     return;
//   }

//   // ── Q2: Materials ────────────────────────────────────────────────────
//   if (session.phase === "q2") {
//     if (text.length < 3) {
//       await msg.reply(
//         "Could you describe your materials in a little more detail? 🪡"
//       );
//       return;
//     }
//     session.answers.materials = text;
//     session.phase = "q3";
//     await msg.reply(
//       "✅ Lovely!\n\n" +
//         "*Question 3 of 3*\n" +
//         "🎯 How do you want to position your work?\n\n" +
//         "*A* — 🏆 *Luxury*\n" +
//         "   _Premium, exclusive, investment piece_\n\n" +
//         "*B* — 🏛 *Heritage*\n" +
//         "   _Tradition, cultural roots, generational craft_\n\n" +
//         "*C* — 🛍 *Everyday*\n" +
//         "   _Accessible, functional, e-commerce ready_\n\n" +
//         "*D* — 🌐 *Other direction*\n\n" +
//         "_Reply with a letter: A, B, C, or D_"
//     );
//     return;
//   }

//   // ── Q3: Positioning ──────────────────────────────────────────────────
//   if (session.phase === "q3") {
//     const map = { a: "luxury", b: "heritage", c: "everyday" };
//     const choice = lower.replace(/[^a-d]/g, "").charAt(0);

//     if (map[choice]) {
//       session.answers.positioning = map[choice];
//       await runPipeline(from, session);
//     } else if (choice === "d") {
//       session.phase = "q3_others";
//       const list = OTHERS_OPTIONS.map((o) => `*${o.key}* — ${o.label}`).join("\n");
//       await msg.reply(
//         "Which direction resonates most with your work?\n\n" +
//           list +
//           "\n\n_Reply with a number (1–5)_"
//       );
//     } else {
//       await msg.reply("Please reply with *A*, *B*, *C*, or *D*.");
//     }
//     return;
//   }

//   // ── Q3 Others ────────────────────────────────────────────────────────
//   if (session.phase === "q3_others") {
//     const opt = OTHERS_OPTIONS.find((o) => o.key === text.trim().charAt(0));
//     if (!opt) {
//       await msg.reply("Please reply with a number between *1* and *5*.");
//       return;
//     }
//     session.answers.positioning = opt.label.toLowerCase();
//     await runPipeline(from, session);
//     return;
//   }

//   // ── CHOOSING ─────────────────────────────────────────────────────────
//   if (session.phase === "choosing") {
//     const profiles = session.profiles;
//     const keys = Object.keys(profiles);
//     const idx = parseInt(lower.replace(/[^0-9]/g, "")) - 1;

//     if (isNaN(idx) || idx < 0 || idx >= keys.length) {
//       await msg.reply(
//         `Please reply with a number between *1* and *${keys.length}*.`
//       );
//       return;
//     }

//     const chosen = profiles[keys[idx]];
//     session.chosenProfile = chosen;
//     session.phase = "done";

//     await client.sendMessage(
//       from,
//       `🎉 *${chosen.positioning.toUpperCase()} direction confirmed!*\n\n` +
//         `━━━━━━━━━━━━━━━\n\n` +
//         `🎯 *Brand Position*\n${chosen.brand_statement}\n\n` +
//         `👤 *Your Audience*\n${chosen.target_audience}\n\n` +
//         `🗣 *Tone of Voice*\n${chosen.tone_of_voice}\n\n` +
//         `💰 *Price Positioning*\n${chosen.price_positioning}\n\n` +
//         `✨ *Key Message*\n"${chosen.key_message}"\n\n` +
//         `━━━━━━━━━━━━━━━\n\n` +
//         `Your brand direction is set. ` +
//         `This profile feeds into the next step — listing copy, social content, and pitch.\n\n` +
//         `Type *restart* to profile another product. 🌿`
//     );
//     return;
//   }

//   // ── Catch-alls ────────────────────────────────────────────────────────
//   if (session.phase === "processing") {
//     await msg.reply("⏳ Still analysing your craft — almost there!");
//   }

//   if (session.phase === "done") {
//     await msg.reply(
//       "You're all set! Type *restart* to start with a new product. 🌿"
//     );
//   }
// });

// // ── Pipeline ───────────────────────────────────────────────────────────────
// async function runPipeline(from, session) {
//   session.phase = "processing";

//   await client.sendMessage(
//     from,
//     `✅ *All inputs received!*\n\n` +
//       `🔍 *Analysing your craft...*\n` +
//       `_This takes about 20–30 seconds_`
//   );

//   try {
//     // Step 1 — Vision analysis
//     const attrs = await analysePhotos(session.photos);
//     console.log("✅ Analysed:", attrs.category);

//     await client.sendMessage(
//       from,
//       `📦 *${attrs.category}* identified\n\n` +
//         `✍️ Generating your 3 brand positioning profiles...`
//     );

//     // Step 2 — Positioning profiles
//     const profiles = await generatePositioningProfiles(attrs, session.answers, session.workspacePhoto);
//     session.profiles = profiles;
//     session.phase = "choosing";

//     const keys = Object.keys(profiles);

//     // Build the A/B/C output message
//     let outputMsg =
//       `🎨 *Your Brand Positioning Profiles*\n\n` +
//       `Based on your *${attrs.category}*, here are 3 directions for your brand:\n\n` +
//       `━━━━━━━━━━━━━━━\n\n`;

//     keys.forEach((key, i) => {
//       const p = profiles[key];
//       const num = `${i + 1}️⃣`;
//       outputMsg +=
//         `${num} *${p.positioning.toUpperCase()}*\n` +
//         `${p.brand_statement}\n\n` +
//         `👤 _${p.target_audience}_\n` +
//         `💰 ${p.price_positioning}\n` +
//         `✨ _"${p.key_message}"_\n\n` +
//         `━━━━━━━━━━━━━━━\n\n`;
//     });

//     outputMsg += `Which direction feels right for your work?\nReply *1*, *2*, or *3*.`;

//     await client.sendMessage(from, outputMsg);
//   } catch (e) {
//     console.error("Pipeline error:", e.message);
//     console.error("Status:", e.response?.status);
//     console.error("Body:", JSON.stringify(e.response?.data));
//     session.phase = "photos";
//     await client.sendMessage(
//       from,
//       `⚠️ Something went wrong: ${e.message.slice(0, 100)}\n\n` +
//         `Please type *restart* and try again.`
//     );
//   }
// }

// client.initialize();