const fs = require("fs");
const path = require("path");

const PROFILES_DIR = path.join(__dirname, "profiles");

function safeId(from) { return from.replace(/[^0-9]/g, ""); }
function profilePath(from) { return path.join(PROFILES_DIR, `${safeId(from)}.json`); }
function productsPath(from) { return path.join(PROFILES_DIR, `${safeId(from)}_products.json`); }
function profileMdPath(from) { return path.join(PROFILES_DIR, `${safeId(from)}_USER_PROFILE.md`); }
function productsMdPath(from) { return path.join(PROFILES_DIR, `${safeId(from)}_PRODUCTS.md`); }

// ── Format a value or fall back to dash ───────────────────────────────────
function val(v) {
  if (v === null || v === undefined || v === "") return "—";
  return v;
}

// ── Generate USER_PROFILE.md ───────────────────────────────────────────────
function exportProfileMd(from) {
  try {
    if (!fs.existsSync(profilePath(from))) return;
    const p = JSON.parse(fs.readFileSync(profilePath(from), "utf8"));

    const lines = [
      `# Artisan Profile`,
      ``,
      `## Identity`,
      `- name: ${val(p.name)}`,
      `- brand_name: ${val(p.brand_name)}`,
      `- brand_location: ${val(p.brand_location)}`,
      `- phone: ${p.phone ? p.phone.replace(/[^0-9+]/g, "") : "—"}`,
      `- onboarded_at: ${val(p.onboarded_at)}`,
      `- craft_category: ${val(p.craft_category)}`,
      `- materials: ${val(p.materials)}`,
      `- hours_per_piece: ${val(p.hours_per_piece)}`,
      ``,
    ];

    if (p.brand_story) {
      lines.push(`## Brand Story`);
      lines.push(``);
      lines.push(p.brand_story);
      lines.push(``);
    }

    lines.push(`## Current Brand Positioning`);
    lines.push(`- positioning: ${val(p.positioning)}`);
    lines.push(`- brand_statement: ${val(p.brand_statement)}`);
    lines.push(`- target_audience: ${val(p.target_audience)}`);
    lines.push(`- tone_of_voice: ${val(p.tone_of_voice)}`);
    lines.push(`- price_positioning: ${val(p.price_positioning)}`);
    lines.push(`- key_message: ${val(p.key_message)}`);
    lines.push(`- last_updated: ${new Date().toISOString()}`);
    lines.push(``);

    if (p.brand_history?.length) {
      lines.push(`## Brand History`);
      lines.push(``);
      p.brand_history.forEach((h) => {
        lines.push(`### ${h.date}`);
        lines.push(`- positioning: ${val(h.positioning)}`);
        if (h.brand_statement) lines.push(`- brand_statement: ${h.brand_statement}`);
        lines.push(`- reason: ${val(h.reason)}`);
        lines.push(``);
      });
    }

    fs.writeFileSync(profileMdPath(from), lines.join("\n"), "utf8");
    console.log(`📄 Profile MD exported → ${profileMdPath(from)}`);
  } catch (e) {
    console.error("exportProfileMd error:", e.message);
  }
}

// ── Generate PRODUCTS.md ───────────────────────────────────────────────────
function exportProductsMd(from) {
  try {
    if (!fs.existsSync(productsPath(from))) return;
    const products = JSON.parse(fs.readFileSync(productsPath(from), "utf8"));

    const lines = [`# Product Listing Log`, ``];

    products.forEach((product, i) => {
      // Generate a SKU if not present: brand initials + category code + index
      const skuBase = product.sku || generateSku(product, i);

      lines.push(`## ${product.title || `Product ${i + 1}`}`);
      lines.push(`- date_listed: ${val(product.date_listed)}`);
      lines.push(`- sku: ${skuBase}`);
      lines.push(`- category: ${val(product.category)}`);
      lines.push(`- materials: ${val(product.materials)}`);
      lines.push(`- hours: ${val(product.hours)}`);
      lines.push(`- price_recommended: ${val(product.price_recommended)}`);
      lines.push(`- price_set: ${product.price_set ? `£${product.price_set}` : "—"}`);
      lines.push(`- positioning: ${val(product.positioning)}`);
      lines.push(`- variants: ${val(product.variants)}`);
      lines.push(`- size: ${val(product.size)}`);
      lines.push(`- sales_channels: ${val(product.sales_channels)}`);
      lines.push(`- description: ${val(product.description)}`);
      lines.push(`- etsy_tags: ${val(product.etsy_tags)}`);
      lines.push(`- shopify_tags: ${val(product.shopify_tags)}`);
      lines.push(`- photo_direction: ${val(product.photo_direction)}`);
      lines.push(`- notes: ${val(product.notes)}`);
      lines.push(``);

      if (i < products.length - 1) lines.push(`---`, ``);
    });

    fs.writeFileSync(productsMdPath(from), lines.join("\n"), "utf8");
    console.log(`📄 Products MD exported → ${productsMdPath(from)}`);
  } catch (e) {
    console.error("exportProductsMd error:", e.message);
  }
}

// ── SKU generator ─────────────────────────────────────────────────────────
function generateSku(product, index) {
  const categoryMap = {
    "hair accessories": "HA",
    "bags": "TB",
    "accessories": "AC",
    "fashion accessories": "FA",
    "ceramic": "CE",
    "jewellery": "JW",
    "textile": "TX",
    "craft": "CR",
  };
  const cat = (product.category || "craft").toLowerCase();
  const code = Object.entries(categoryMap).find(([k]) => cat.includes(k))?.[1] || "XX";
  const num = String(index + 1).padStart(3, "0");
  return `ART-${code}-${num}`;
}

// ── Export both at once ────────────────────────────────────────────────────
function exportAll(from) {
  exportProfileMd(from);
  exportProductsMd(from);
}

module.exports = { exportProfileMd, exportProductsMd, exportAll };
