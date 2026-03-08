const axios = require("axios");
require("dotenv").config();

const FLOCK = {
  baseURL: process.env.FLOCK_BASE_URL || "https://api.flock.io/v1",
  headers: {
    Authorization: `Bearer ${process.env.FLOCK_API_KEY}`,
    "Content-Type": "application/json",
  },
};

// ── Vision analysis ────────────────────────────────────────────────────────
async function analysePhotos(photos) {
  console.log("🔍 FLock: analysing photos...");

  const ANGLE_LABELS = ["front view", "side view", "back view", "close-up detail"];

  const images = photos.map((p) => ({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${p.b64}` },
  }));

  const photoNotes = photos.map((_, i) => {
    const label = ANGLE_LABELS[i] || `extra close-up ${i - 3}`;
    return `Photo ${i + 1}: ${label}`;
  }).join(", ");

  const response = await axios.post(
    `${FLOCK.baseURL}/chat/completions`,
    {
      model: "gemini-3-flash-preview",
      messages: [
        {
          role: "user",
          content: [
            ...images,
            {
              type: "text",
              text: `You are an expert craft appraiser and brand consultant. Analyse these photos of a handcrafted product (${photoNotes}).

Return ONLY valid JSON — no markdown, no extra text:
{
  "category": "specific product type e.g. wheel-thrown ceramic mug",
  "material": "material visible in photos e.g. stoneware with natural ash glaze",
  "technique": "making technique visible e.g. wheel-thrown and kiln-fired",
  "finish": "surface finish e.g. matte natural ash glaze",
  "colours": ["primary colour", "secondary colour"],
  "dimensions": "estimated size e.g. 10cm tall, 8cm diameter",
  "key_features": ["feature 1", "feature 2", "feature 3"],
  "visual_quality": "premium / mid-range / accessible",
  "craft_story": "one warm sentence about the artisan skill visible in this piece"
}`,
            },
          ],
        },
      ],
    },
    { headers: FLOCK.headers, timeout: 30000 }
  );

  const raw = response.data.choices[0].message.content
    .replace(/```json|```/g, "")
    .trim();
  return JSON.parse(raw);
}

// ── Positioning prompt library ─────────────────────────────────────────────
const POSITIONING_PROMPTS = {
  luxury: `Position this as an EXCLUSIVE LUXURY piece.
- Frame it as a rare, investment-worthy object of desire
- Speak to collectors, interior designers, gift-givers with discerning taste
- Language: refined, aspirational, understated confidence
- Price: justify a premium — this is a once-owned, forever-kept piece`,

  heritage: `Position this as a HERITAGE CRAFT piece.
- Root it in tradition, cultural lineage, and generational skill
- Speak to those who value provenance, authenticity, and the story of making
- Language: warm, story-driven, grounded in place and memory
- Price: mid-to-premium — reflect the years of knowledge embedded in the work`,

  everyday: `Position this for EVERYDAY E-COMMERCE.
- Lead with practical beauty and daily joy
- Speak to broad audiences — gift-buyers, home decorators, everyday shoppers
- Language: friendly, clear, benefit-led — great for Etsy, Depop, Vinted
- Price: accessible and competitive — value is visible and easy to understand`,

  "eco / sustainable": `Position this as an ECO / SUSTAINABLE craft.
- Lead with conscious materials, low-waste process, and ethical making
- Speak to eco-aware shoppers who align purchases with values
- Language: grounded, responsible, quietly proud
- Price: mid-range — sustainability is a premium, but accessible`,

  "community / local craft": `Position this as COMMUNITY / LOCAL CRAFT.
- Root it in the maker's community, regional identity, and shared pride
- Speak to those who want to support independent makers and local economies
- Language: human, warm, neighbourly — buy-local energy
- Price: fair and transparent — emphasise maker's livelihood`,

  "gift / occasion-based": `Position this as a GIFTING piece.
- Frame it around occasions: birthdays, housewarmings, weddings, milestones
- Speak to gift-givers seeking something meaningful and memorable
- Language: celebratory, emotionally resonant, keepsake-focused
- Price: gift-bracket friendly — clear value for the recipient`,

  "minimalist / contemporary": `Position this as MINIMALIST / CONTEMPORARY design.
- Lead with clean aesthetic, considered form, and modern lifestyle fit
- Speak to design-conscious buyers, interior curators, and modernists
- Language: precise, confident, pared back — let the object speak
- Price: mid-to-premium — design quality justifies the cost`,

  "spiritual / wellness": `Position this as a SPIRITUAL / WELLNESS piece.
- Connect the object to ritual, mindfulness, and intentional living
- Speak to those who want objects with meaning — not just function
- Language: soulful, grounded, quietly transformative
- Price: mid-range — accessible enough to feel inviting, premium enough to feel special`,
};

// ── Positioning profile generator ──────────────────────────────────────────
async function generatePositioningProfiles(attrs, userAnswers, workspacePhoto = null) {
  console.log("✍️  FLock: generating positioning profiles...");

  const userPositioning = userAnswers.positioning || userAnswers.tweak || "everyday";
  const mainThree = ["luxury", "heritage", "everyday"];

  let profilesToGenerate;
  if (mainThree.includes(userPositioning)) {
    profilesToGenerate = ["luxury", "heritage", "everyday"];
  } else {
    profilesToGenerate = [userPositioning, "heritage", "everyday"];
  }

  const productContext = `
PRODUCT: ${attrs.category}
MATERIAL (user-confirmed): ${userAnswers.materials || attrs.material}
TECHNIQUE: ${attrs.technique || "handcrafted"}
COLOURS: ${(attrs.colours || []).join(", ")}
KEY FEATURES: ${(attrs.key_features || []).join(", ")}
VISUAL QUALITY: ${attrs.visual_quality || ""}
HOURS TO MAKE: ${userAnswers.hours || ""}
CRAFT STORY: ${attrs.craft_story || ""}
ARTISAN'S INSTINCT: ${userPositioning}
ARTISAN TWEAK FEEDBACK: ${userAnswers.tweak || "none"}
WORKSPACE PHOTO PROVIDED: ${workspacePhoto ? "yes — factor in the maker's environment and process story" : "no"}
`.trim();

  const profilePromises = profilesToGenerate.map(async (positioning) => {
    const posPrompt = POSITIONING_PROMPTS[positioning] || POSITIONING_PROMPTS.everyday;

    const response = await axios.post(
      `${FLOCK.baseURL}/chat/completions`,
      {
        model: "qwen3-235b-a22b-instruct-2507",
        messages: [
          {
            role: "user",
            content: `You are a brand strategist specialising in artisan crafts and independent makers.
${workspacePhoto ? "\nThe maker also shared a photo of their workspace/tools/process — factor in the authenticity and handmade story this implies.\n" : ""}
PRODUCT CONTEXT:
${productContext}

POSITIONING DIRECTION:
${posPrompt}

Write a brand positioning profile for this specific product in this direction.
Return ONLY valid JSON — no markdown:
{
  "positioning": "${positioning}",
  "brand_statement": "One clear sentence positioning this specific product — what it is and why it matters",
  "target_audience": "Who buys this — one sentence, specific and vivid",
  "tone_of_voice": "Three adjectives that define the brand voice for this direction",
  "price_positioning": "Suggested price range with one-line rationale e.g. £75–£95 — reflects the skill and material quality",
  "key_message": "The single thing a buyer must remember — max 12 words, punchy"
}`,
          },
        ],
        temperature: 0.72,
      },
      { headers: FLOCK.headers, timeout: 30000 }
    );

    const raw = response.data.choices[0].message.content
      .replace(/```json|```/g, "")
      .trim();
    return JSON.parse(raw);
  });

  const results = await Promise.all(profilePromises);

  const profiles = {};
  profilesToGenerate.forEach((key, i) => {
    profiles[key] = results[i];
  });

  return profiles;
}

// ── Listing generator ──────────────────────────────────────────────────────
async function generateListing(attrs, answers, profile, editFeedback = null) {
  console.log("📦 FLock: generating listing...");

  const context = `
BRAND: ${profile.brand_name}
POSITIONING: ${profile.positioning}
TONE OF VOICE: ${profile.tone_of_voice}
TARGET AUDIENCE: ${profile.target_audience}
PRICE POSITIONING: ${profile.price_positioning}

PRODUCT: ${attrs.category}
MATERIAL: ${answers.materials || attrs.material}
TECHNIQUE: ${attrs.technique || "handcrafted"}
KEY FEATURES: ${(attrs.key_features || []).join(", ")}
COLOURS: ${(attrs.colours || []).join(", ")}
DIMENSIONS: ${attrs.dimensions || "not specified"}
CRAFT STORY: ${attrs.craft_story || ""}
HOURS TO MAKE: ${answers.hours}
ARTISAN'S PRICE: ${answers.price ? `£${answers.price}` : "not specified"}
`.trim();

  const editNote = editFeedback
    ? `\n\nThe artisan has requested the following changes to the previous listing:\n"${editFeedback}"\nApply these changes while keeping everything else consistent.`
    : "";

  const response = await axios.post(
    `${FLOCK.baseURL}/chat/completions`,
    {
      model: "qwen3-235b-a22b-instruct-2507",
      messages: [
        {
          role: "user",
          content: `You are an expert e-commerce copywriter specialising in handmade and artisan products.

BRAND & PRODUCT CONTEXT:
${context}
${editNote}

Write a complete e-commerce listing for this product.
Return ONLY valid JSON — no markdown:
{
  "title": "SEO-optimised product title, under 80 characters, no ALL CAPS",
  "description": "150-200 word product description in the brand tone of voice. Open with the craft story, describe materials and technique, highlight key features, close with a subtle call to action. Flowing prose — no bullet points.",
  "etsy_tags": "13 comma-separated Etsy tags, mix of specific and broad, optimised for search",
  "shopify_tags": "8 comma-separated Shopify tags for collections and filtering",
  "price_recommended": "Suggested retail price with currency symbol and one-line rationale",
  "photo_direction": "3 specific tips for photographing this exact piece to maximise its appeal on Etsy/Shopify"
}`,
        },
      ],
      temperature: 0.7,
    },
    { headers: FLOCK.headers, timeout: 30000 }
  );

  const raw = response.data.choices[0].message.content
    .replace(/```json|```/g, "")
    .trim();
  return JSON.parse(raw);
}

// ── Product photo generator (Gemini Imagen 3) ──────────────────────────────
async function generateProductPhoto(attrs, listing, profile) {
  console.log("🎨 Gemini: generating product photo...");

  // Step 1 — build a detailed image prompt using existing Flock/qwen model
  const promptResponse = await axios.post(
    `${FLOCK.baseURL}/chat/completions`,
    {
      model: "qwen3-235b-a22b-instruct-2507",
      messages: [
        {
          role: "user",
          content: `You are a professional product photography art director.

PRODUCT: ${attrs.category}
MATERIAL: ${attrs.material}
COLOURS: ${(attrs.colours || []).join(", ")}
KEY FEATURES: ${(attrs.key_features || []).join(", ")}
FINISH: ${attrs.finish || ""}
BRAND POSITIONING: ${profile.positioning}
TONE: ${profile.tone_of_voice}
LISTING TITLE: ${listing.title}

Write a single image generation prompt (max 120 words) for a professional e-commerce product photo of this item.
The prompt should describe:
- Clean, styled product photography
- Background and surface that matches the brand positioning (e.g. marble for luxury, natural linen for heritage, white studio for everyday)
- Lighting that flatters the material and finish
- Any styling props that reinforce the brand story (max 1–2 subtle props)
- Shot angle: slightly elevated 3/4 view unless the product strongly benefits from another angle

Return ONLY the image prompt — no explanation, no JSON, no quotes.`,
        },
      ],
      temperature: 0.6,
    },
    { headers: FLOCK.headers, timeout: 20000 }
  );

  const imagePrompt = promptResponse.data.choices[0].message.content.trim();
  console.log("🎨 Image prompt:", imagePrompt);

  // Step 2 — generate image via Gemini 3.1 Flash Image (nano-banana)
  const geminiResponse = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent`,
    {
      contents: [{ parts: [{ text: imagePrompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      timeout: 60000,
    }
  );

  const parts = geminiResponse.data.candidates[0].content.parts;
  const imagePart = parts.find(p => p.inlineData);
  if (!imagePart) throw new Error("No image returned from Gemini");

  const b64 = imagePart.inlineData.data;
  return { b64, prompt: imagePrompt };
}

module.exports = { analysePhotos, generatePositioningProfiles, generateListing, generateProductPhoto };

// //with lisiing generator and edit feedback loop added in v1.1
// const axios = require("axios");
// require("dotenv").config();

// const FLOCK = {
//   baseURL: process.env.FLOCK_BASE_URL || "https://api.flock.io/v1",
//   headers: {
//     Authorization: `Bearer ${process.env.FLOCK_API_KEY}`,
//     "Content-Type": "application/json",
//   },
// };

// // ── Vision analysis ────────────────────────────────────────────────────────
// async function analysePhotos(photos) {
//   console.log("🔍 FLock: analysing photos...");

//   const ANGLE_LABELS = ["front view", "side view", "back view", "close-up detail"];

//   const images = photos.map((p) => ({
//     type: "image_url",
//     image_url: { url: `data:image/jpeg;base64,${p.b64}` },
//   }));

//   const photoNotes = photos.map((_, i) => {
//     const label = ANGLE_LABELS[i] || `extra close-up ${i - 3}`;
//     return `Photo ${i + 1}: ${label}`;
//   }).join(", ");

//   const response = await axios.post(
//     `${FLOCK.baseURL}/chat/completions`,
//     {
//       model: "gemini-3-flash-preview",
//       messages: [
//         {
//           role: "user",
//           content: [
//             ...images,
//             {
//               type: "text",
//               text: `You are an expert craft appraiser and brand consultant. Analyse these photos of a handcrafted product (${photoNotes}).

// Return ONLY valid JSON — no markdown, no extra text:
// {
//   "category": "specific product type e.g. wheel-thrown ceramic mug",
//   "material": "material visible in photos e.g. stoneware with natural ash glaze",
//   "technique": "making technique visible e.g. wheel-thrown and kiln-fired",
//   "finish": "surface finish e.g. matte natural ash glaze",
//   "colours": ["primary colour", "secondary colour"],
//   "dimensions": "estimated size e.g. 10cm tall, 8cm diameter",
//   "key_features": ["feature 1", "feature 2", "feature 3"],
//   "visual_quality": "premium / mid-range / accessible",
//   "craft_story": "one warm sentence about the artisan skill visible in this piece"
// }`,
//             },
//           ],
//         },
//       ],
//     },
//     { headers: FLOCK.headers, timeout: 30000 }
//   );

//   const raw = response.data.choices[0].message.content
//     .replace(/```json|```/g, "")
//     .trim();
//   return JSON.parse(raw);
// }

// // ── Positioning prompt library ─────────────────────────────────────────────
// const POSITIONING_PROMPTS = {
//   luxury: `Position this as an EXCLUSIVE LUXURY piece.
// - Frame it as a rare, investment-worthy object of desire
// - Speak to collectors, interior designers, gift-givers with discerning taste
// - Language: refined, aspirational, understated confidence
// - Price: justify a premium — this is a once-owned, forever-kept piece`,

//   heritage: `Position this as a HERITAGE CRAFT piece.
// - Root it in tradition, cultural lineage, and generational skill
// - Speak to those who value provenance, authenticity, and the story of making
// - Language: warm, story-driven, grounded in place and memory
// - Price: mid-to-premium — reflect the years of knowledge embedded in the work`,

//   everyday: `Position this for EVERYDAY E-COMMERCE.
// - Lead with practical beauty and daily joy
// - Speak to broad audiences — gift-buyers, home decorators, everyday shoppers
// - Language: friendly, clear, benefit-led — great for Etsy, Depop, Vinted
// - Price: accessible and competitive — value is visible and easy to understand`,

//   "eco / sustainable": `Position this as an ECO / SUSTAINABLE craft.
// - Lead with conscious materials, low-waste process, and ethical making
// - Speak to eco-aware shoppers who align purchases with values
// - Language: grounded, responsible, quietly proud
// - Price: mid-range — sustainability is a premium, but accessible`,

//   "community / local craft": `Position this as COMMUNITY / LOCAL CRAFT.
// - Root it in the maker's community, regional identity, and shared pride
// - Speak to those who want to support independent makers and local economies
// - Language: human, warm, neighbourly — buy-local energy
// - Price: fair and transparent — emphasise maker's livelihood`,

//   "gift / occasion-based": `Position this as a GIFTING piece.
// - Frame it around occasions: birthdays, housewarmings, weddings, milestones
// - Speak to gift-givers seeking something meaningful and memorable
// - Language: celebratory, emotionally resonant, keepsake-focused
// - Price: gift-bracket friendly — clear value for the recipient`,

//   "minimalist / contemporary": `Position this as MINIMALIST / CONTEMPORARY design.
// - Lead with clean aesthetic, considered form, and modern lifestyle fit
// - Speak to design-conscious buyers, interior curators, and modernists
// - Language: precise, confident, pared back — let the object speak
// - Price: mid-to-premium — design quality justifies the cost`,

//   "spiritual / wellness": `Position this as a SPIRITUAL / WELLNESS piece.
// - Connect the object to ritual, mindfulness, and intentional living
// - Speak to those who want objects with meaning — not just function
// - Language: soulful, grounded, quietly transformative
// - Price: mid-range — accessible enough to feel inviting, premium enough to feel special`,
// };

// // ── Positioning profile generator ──────────────────────────────────────────
// async function generatePositioningProfiles(attrs, userAnswers, workspacePhoto = null) {
//   console.log("✍️  FLock: generating positioning profiles...");

//   const userPositioning = userAnswers.positioning || userAnswers.tweak || "everyday";
//   const mainThree = ["luxury", "heritage", "everyday"];

//   let profilesToGenerate;
//   if (mainThree.includes(userPositioning)) {
//     profilesToGenerate = ["luxury", "heritage", "everyday"];
//   } else {
//     profilesToGenerate = [userPositioning, "heritage", "everyday"];
//   }

//   const productContext = `
// PRODUCT: ${attrs.category}
// MATERIAL (user-confirmed): ${userAnswers.materials || attrs.material}
// TECHNIQUE: ${attrs.technique || "handcrafted"}
// COLOURS: ${(attrs.colours || []).join(", ")}
// KEY FEATURES: ${(attrs.key_features || []).join(", ")}
// VISUAL QUALITY: ${attrs.visual_quality || ""}
// HOURS TO MAKE: ${userAnswers.hours || ""}
// CRAFT STORY: ${attrs.craft_story || ""}
// ARTISAN'S INSTINCT: ${userPositioning}
// ARTISAN TWEAK FEEDBACK: ${userAnswers.tweak || "none"}
// WORKSPACE PHOTO PROVIDED: ${workspacePhoto ? "yes — factor in the maker's environment and process story" : "no"}
// `.trim();

//   const profilePromises = profilesToGenerate.map(async (positioning) => {
//     const posPrompt = POSITIONING_PROMPTS[positioning] || POSITIONING_PROMPTS.everyday;

//     const response = await axios.post(
//       `${FLOCK.baseURL}/chat/completions`,
//       {
//         model: "qwen3-235b-a22b-instruct-2507",
//         messages: [
//           {
//             role: "user",
//             content: `You are a brand strategist specialising in artisan crafts and independent makers.
// ${workspacePhoto ? "\nThe maker also shared a photo of their workspace/tools/process — factor in the authenticity and handmade story this implies.\n" : ""}
// PRODUCT CONTEXT:
// ${productContext}

// POSITIONING DIRECTION:
// ${posPrompt}

// Write a brand positioning profile for this specific product in this direction.
// Return ONLY valid JSON — no markdown:
// {
//   "positioning": "${positioning}",
//   "brand_statement": "One clear sentence positioning this specific product — what it is and why it matters",
//   "target_audience": "Who buys this — one sentence, specific and vivid",
//   "tone_of_voice": "Three adjectives that define the brand voice for this direction",
//   "price_positioning": "Suggested price range with one-line rationale e.g. £75–£95 — reflects the skill and material quality",
//   "key_message": "The single thing a buyer must remember — max 12 words, punchy"
// }`,
//           },
//         ],
//         temperature: 0.72,
//       },
//       { headers: FLOCK.headers, timeout: 30000 }
//     );

//     const raw = response.data.choices[0].message.content
//       .replace(/```json|```/g, "")
//       .trim();
//     return JSON.parse(raw);
//   });

//   const results = await Promise.all(profilePromises);

//   const profiles = {};
//   profilesToGenerate.forEach((key, i) => {
//     profiles[key] = results[i];
//   });

//   return profiles;
// }

// // ── Listing generator ──────────────────────────────────────────────────────
// async function generateListing(attrs, answers, profile, editFeedback = null) {
//   console.log("📦 FLock: generating listing...");

//   const context = `
// BRAND: ${profile.brand_name}
// POSITIONING: ${profile.positioning}
// TONE OF VOICE: ${profile.tone_of_voice}
// TARGET AUDIENCE: ${profile.target_audience}
// PRICE POSITIONING: ${profile.price_positioning}

// PRODUCT: ${attrs.category}
// MATERIAL: ${answers.materials || attrs.material}
// TECHNIQUE: ${attrs.technique || "handcrafted"}
// KEY FEATURES: ${(attrs.key_features || []).join(", ")}
// COLOURS: ${(attrs.colours || []).join(", ")}
// DIMENSIONS: ${attrs.dimensions || "not specified"}
// CRAFT STORY: ${attrs.craft_story || ""}
// HOURS TO MAKE: ${answers.hours}
// ARTISAN'S PRICE: ${answers.price ? `£${answers.price}` : "not specified"}
// `.trim();

//   const editNote = editFeedback
//     ? `\n\nThe artisan has requested the following changes to the previous listing:\n"${editFeedback}"\nApply these changes while keeping everything else consistent.`
//     : "";

//   const response = await axios.post(
//     `${FLOCK.baseURL}/chat/completions`,
//     {
//       model: "qwen3-235b-a22b-instruct-2507",
//       messages: [
//         {
//           role: "user",
//           content: `You are an expert e-commerce copywriter specialising in handmade and artisan products.

// BRAND & PRODUCT CONTEXT:
// ${context}
// ${editNote}

// Write a complete e-commerce listing for this product.
// Return ONLY valid JSON — no markdown:
// {
//   "title": "SEO-optimised product title, under 80 characters, no ALL CAPS",
//   "description": "150-200 word product description in the brand tone of voice. Open with the craft story, describe materials and technique, highlight key features, close with a subtle call to action. Flowing prose — no bullet points.",
//   "etsy_tags": "13 comma-separated Etsy tags, mix of specific and broad, optimised for search",
//   "shopify_tags": "8 comma-separated Shopify tags for collections and filtering",
//   "price_recommended": "Suggested retail price with currency symbol and one-line rationale",
//   "photo_direction": "3 specific tips for photographing this exact piece to maximise its appeal on Etsy/Shopify"
// }`,
//         },
//       ],
//       temperature: 0.7,
//     },
//     { headers: FLOCK.headers, timeout: 30000 }
//   );

//   const raw = response.data.choices[0].message.content
//     .replace(/```json|```/g, "")
//     .trim();
//   return JSON.parse(raw);
// }

// module.exports = { analysePhotos, generatePositioningProfiles, generateListing };
