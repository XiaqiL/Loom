# Agent 02

From Agent 01 we receive 2 documents，serves as the background information of Agent 02：

1. user.md: Branding Information；
2. product.md：Product Listings；

Agent 02 has 2 cron tasks in total:

Cron job 01:

![Cron job 1: OpenClaw Chain of Thought](Agent%2002/image.png)

Cron job 1: OpenClaw Chain of Thought

![image.png](Agent%2002/image%201.png)

![image.png](Agent%2002/image%202.png)

![Cron job 01: Whatsapp](Agent%2002/image%203.png)

Cron job 01: Whatsapp

*Prompt for Cron job 01:* 

![image.png](Agent%2002/image%204.png)

```
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

Cron job 02: 

![Cron job 2: OpenClaw Chain of Thought](Agent%2002/image%205.png)

Cron job 2: OpenClaw Chain of Thought

![Cron job 02: Whatsapp](Agent%2002/image%206.png)

Cron job 02: Whatsapp

*Prompt for Cron job 02:* 

![image.png](Agent%2002/image%207.png)

```
Read `user.md` in the workspace to understand the brand profile, target audience, and positioning.
Then read `product.md` to understand the product catalog and core product categories.

Using website research tool. Visit websites and Research comparable products across Etsy, Shopify stores, Instagram shops, Google Shopping, and Amazon for the relevant user's product categories.

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
Once the job is done, send a WhatsApp message to the user with a concise summary of the key findings and confirmation that `rebranding.md` has been updated.

Use this format:
`Weekly market insight saved ✅, current date: {current_date}`

You may also include 2–4 short bullet points covering:
- notable platform price ranges
- top seller patterns in colors/fabrics
- popular tags
- key pricing or rebranding recommendation
```

*OpenClaw Bot conduct market research automatically by searching Etsy Platform*

![image.png](Agent%2002/image%208.png)

![image.png](Agent%2002/image%209.png)

![image.png](Agent%2002/image%2010.png)

![image.png](Agent%2002/image%2011.png)