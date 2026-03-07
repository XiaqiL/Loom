# Agent 02

## Overview

Agent 02 receives the following background documents from Agent 01:

- `user.md`: brand, business, and seller profile
- `product.md`: product catalog and listing information

Agent 02 runs two weekly cron jobs:

1. Revenue Detection
2. Market & Rebranding Insight

---

## General Rules

- Use the workspace files as the source of truth.
- Read `user.md` and `product.md` before taking action.
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
Read `user.md` in the workspace to understand the brand and seller profile.
Then read `product.md` to review the current product catalog.

Contact the user and request the latest financial metrics for their shop(s). Collect, at minimum, the following information for each product or shop where available:
- product listing / product name
- selling price
- units sold
- revenue generated
- reporting period
- platform / shop name

Create or update `revenue_detection.csv` in the workspace:
- If `revenue_detection.csv` does not exist, create it.
- If it already exists, update the relevant rows based on the user’s latest response.
- Always record the latest update timestamp for each new or modified entry.

After the file is created or updated, send this WhatsApp message to the user:
`Revenue detection done ✅, current date: {current_date}`
```

### Output File
- `revenue_detection.csv`

### Expected Minimum Columns
Suggested columns for `revenue_detection.csv`:

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
Read `user.md` in the workspace to understand the brand profile, target audience, and positioning.
Then read `product.md` to understand the product catalog and core product categories.

Research comparable products across Etsy, Shopify stores, Instagram shops, Google Shopping, and Amazon for the relevant product categories.

For each platform, gather and summarize:
1. overall price range
2. price range of the top 10 sellers
3. common colors and fabrics/materials used by the top 10 sellers
4. popular tags / keywords used in the category

Then review `revenue_detection.csv` in the workspace and use it together with the market research to generate practical rebranding and pricing insights.

Create or update `rebranding.md` in the workspace:
- If `rebranding.md` does not exist, create it.
- If it already exists, update it with the latest market insights and recommendations.
- Always record the latest update timestamp.

The final `rebranding.md` should include:
- market overview by platform
- pricing benchmark
- competitor patterns in colors, fabrics/materials, and tags
- recommendations for pricing, positioning, product development, and rebranding direction
```

### Output File
- `rebranding.md`

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

- `user.md`
- `product.md`
- `revenue_detection.csv`
- `rebranding.md`
- `AGENT02_PROMPTS.md`

