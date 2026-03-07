# Agent 02 - Research/Rebranding/Revenue Detection Agent 🦞

## Overview

Agent 02 receives the following background documents from Agent 01:

- `{userid}_USER_PROFILE.md`: brand, business, and seller profile
- `{userid}_PRODUCTS.md`: product catalog and listing information

Agent 02 runs two weekly cron jobs:

1. Revenue Detection
2. Market & Rebranding Insight

---

## General Rules

- Use the workspace files as the source of truth.
- Read `{userid}_USER_PROFILE.md` and `{userid}_PRODUCTS.md` before taking action.
- Keep file names exactly as specified.
- Do not overwrite useful historical data unnecessarily.
- Always record the latest update timestamp for created or modified outputs.
- Use clear, concise, professional business English in all generated content.
- Both jobs are executed weekly.

---

## Cron Job 01 — Revenue Detection

### Purpose
Collect the latest weekly financial performance data for the user’s shop(s) and maintain a structured revenue tracking file.

### Prompt

```text
Read `{userid}_USER_PROFILE.md` in the workspace to understand the brand and seller profile.
Then read `{userid}_PRODUCTS.md` to review the current product catalog.

Contact the user and request the latest financial metrics for their shop(s). Collect, at minimum, the following information for each product or shop where available:
- product listing / product name
- selling price
- units sold
- revenue generated
- reporting period
- platform / shop name

Create or update `{userid}_revenue_detection.csv` in the workspace:
- If `revenue_detection.csv` does not exist, create it.
- If it already exists, update the relevant rows based on the user’s latest response.
- Always record the latest update timestamp for each new or modified entry.

After the file is created or updated, send this WhatsApp message to the user:
`Revenue detection done ✅, current date: {current_date}`
```

### Output File
- `{userid}_revenue_detection.csv`

### Expected Minimum Columns
Suggested columns for `{userid}_revenue_detection.csv`:

- `update_time`
- `reporting_week`
- `platform`
- `shop_name`
- `product_name`
- `sku`
- `selling_price`
- `units_sold`
- `revenue_generated`
- `currency`
- `notes`

---

## Cron Job 02 — Market & Rebranding Insight

### Purpose
Research the market across major selling platforms, benchmark competitors, and generate weekly rebranding and pricing insights based on both market data and internal revenue performance.

### Prompt

```text
Read `{userid}_USER_PROFILE.md` in the workspace to understand the brand profile, target audience, and positioning.
Then read `{userid}_PRODUCTS.md` to understand the product catalog and core product categories.

Research comparable products across Etsy, Shopify stores, Instagram shops, Google Shopping, and Amazon for the relevant product categories.

For each platform, gather and summarize:
1. overall price range
2. price range of the top 10 sellers
3. common colors and fabrics/materials used by the top 10 sellers
4. popular tags / keywords used in the category

Then review `{userid}_revenue_detection.csv` in the workspace and use it together with the market research to generate practical rebranding and pricing insights.

Create or update `{userid}_rebranding.md` in the workspace:
- If `rebranding.md` does not exist, create it.
- If it already exists, update it with the latest market insights and recommendations.
- Always record the latest update timestamp.

The final `{userid}_rebranding.md` should include:
- market overview by platform
- pricing benchmark
- competitor patterns in colors, fabrics/materials, and tags
- recommendations for pricing, positioning, product development, and rebranding direction

Once the job is done, send a WhatsApp message to the user with a concise summary of the key findings and confirmation that `rebranding.md` has been updated.

Use this format:
`Weekly market insight saved ✅, current date: {current_date}`

You may also include 2–4 short bullet points covering:
- notable platform price ranges
- top seller patterns in colors/fabrics
- popular tags
- key pricing or rebranding recommendation
```

### Output File
- `{userid}_rebranding.md`

### Recommended Structure for `rebranding.md`

```md
# Rebranding Insight

## Update Time

## Executive Summary

## Platform Market Overview
### Etsy
### Shopify
### Instagram Shop
### Google Shopping
### Amazon

## Pricing Benchmark

## Competitor Patterns
### Colors
### Fabrics / Materials
### Tags / Keywords

## Revenue Detection Reference

## Recommendations
### Pricing
### Positioning
### Product Development
### Rebranding Direction
```

---

## Weekly Execution Notes

- Cron Job 01 should run once per week to collect and update the latest financial metrics.
- Cron Job 02 should run once per week after `revenue_detection.csv` has been updated.
- Cron Job 02 should use the latest revenue data as part of its analysis.
- Historical records should be preserved whenever possible so trends can be analyzed over time.

---

## Repository Notes

Recommended files for the project repository:

- `{userid}_USER_PROFILE.md`
- `{userid}_PRODUCTS.md`
- `{userid}_revenue_detection.csv`
- `{userid}_rebranding.md`
- `AGENT02_PROMPTS.md`

