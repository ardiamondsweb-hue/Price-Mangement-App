# Diamondleaf Shopify Pricing App

Node-based Shopify pricing app for jewellery products. It reads your product metafields, decides whether the diamond is `natural` or `lab-grown`, calculates the price using your formula, writes a price breakup back to Shopify, and updates the actual variant price so cart and checkout use the same amount.

## Pricing formula

Natural diamond:

`G1 + ND + S1 + M + GST`

Lab-grown diamond:

`G1 + LD + S1 + M + GST`

Where:

- `G1 = gold price according to purity x gold weight`
- `ND = natural diamond flat price per ct x total diamond weight`
- `LD = slab rate x exact diamond weight`
- `S1 = stone total weight x stone price per ct`
- `M = making`
- `GST = subtotal x GST %`

## Important Shopify note

This app is built to work on all Shopify plans by updating the **variant price itself** from your formula.

That means:

- product page price matches your formula
- cart price matches your formula
- checkout price matches your formula

If you want live line-price override at checkout without updating variant price, Shopify only allows `Cart Transform lineUpdate` on **development stores** or **Shopify Plus**. Shopify documents that limitation here:

- [Cart Transform Function API](https://shopify.dev/docs/api/functions/latest/cart-transform#targets)

Shopify’s current Dev Dashboard token flow docs:

- [Client credentials grant](https://shopify.dev/apps/build/authentication-authorization/access-tokens/client-credentials-grant)
- [Get API access tokens for Dev Dashboard apps](https://shopify.dev/apps/build/dev-dashboard/get-api-access-tokens)

## Metafields used

Default namespace: `custom`

Default keys configured in this app:

- `diamond_quality`
- `diamond_type`
- `gold_weight_gm`
- `gold_purity`
- `stone_price_ct`
- `stone_total_wt`
- `total_diamond_weight`
- `making_charges_in_pct`
- `making_charges_gm`
- `natural_diamond_price_ct`
- `product_total_weight`
- `categories`
- `stone_total_pcs`
- `diamond_certification`
- `diamond_purity`
- `diamond_shape`
- `diamond_colour`
- `number_of_diamond`
- `gold_colour`
- `sku_code`

You can change all key names from the app settings page if your Shopify metafield keys are different.

## What the app writes back

Namespace: `diamondleaf_pricing`

- `gold_value`
- `diamond_value`
- `stone_value`
- `making_value`
- `gst_value`
- `subtotal_value`
- `total_value`
- `diamond_kind`
- `diamond_kind_label`
- `formula_label`
- `breakdown_json`

These are used by the provided breakup block/snippet.

## Setup steps

1. Open your app in the **Shopify Dev Dashboard**.
2. Configure Admin API access scopes:
   - `read_products`
   - `write_products`
   - `read_metafields`
   - `write_metafields`
3. Install the app on your store.
4. Open the app `Settings` page in Dev Dashboard.
5. Copy the `Client ID` and `Secret`.
6. In this project, create `.env` from `.env.example`.
7. Fill these values:

```env
PORT=3000
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_API_KEY=your_dev_dashboard_client_id
SHOPIFY_API_SECRET=your_dev_dashboard_client_secret
APP_PASSWORD=choose-a-password-if-you-want-basic-auth
DEFAULT_CURRENCY=INR
```

8. Install packages:

```bash
npm install
```

9. Start the app:

```bash
npm run dev
```

10. Open [http://localhost:3000](http://localhost:3000)
11. On the dashboard, update the `Daily manual rates` form:
   - gold rates by purity
   - natural diamond flat price/ct
   - GST
   - making defaults
   - lab-grown diamond slabs
12. Click `Save daily rates`
13. Click `Recalculate all product prices`
14. Use `Pricing settings` only when you want to change metafield keys or advanced config

## How authentication works now

For Dev Dashboard apps, Shopify no longer shows a permanent Admin API token in the UI.
This app now requests a token programmatically using the client credentials grant:

`POST https://{shop}.myshopify.com/admin/oauth/access_token`

with:

- `grant_type=client_credentials`
- `client_id=SHOPIFY_API_KEY`
- `client_secret=SHOPIFY_API_SECRET`

Shopify returns an access token that is valid for 24 hours. This app refreshes that token automatically when needed.

## Natural vs lab-grown detection

The app reads both:

- `custom.diamond_type`
- `custom.diamond_quality`

If either value contains `lab`, the product is treated as `lab-grown`.
Otherwise it is treated as `natural`.

Examples:

- `Lab Grown` -> lab-grown
- `Lab` -> lab-grown
- `Natural` -> natural
- blank -> natural

## Natural diamond price source

For natural diamonds the formula needs a flat price per carat.

This app supports two ways:

1. Global default from settings: `defaultNaturalDiamondFlatPricePerCt`
2. Product metafield override: `custom.natural_diamond_price_ct`

If you already store natural diamond rate in some other metafield, just change the key in settings.

## Breakup block file

This repo includes:

- snippet: [theme/snippets/diamondleaf-price-breakdown.liquid](/Users/yashikavaswani/Desktop/diamondleaf%20price%20app/theme/snippets/diamondleaf-price-breakdown.liquid)
- theme extension block stub: [extensions/diamondleaf-price-breakdown/blocks/diamondleaf-price-breakdown.liquid](/Users/yashikavaswani/Desktop/diamondleaf%20price%20app/extensions/diamondleaf-price-breakdown/blocks/diamondleaf-price-breakdown.liquid)

### Fastest way to use in theme

Copy the snippet into your theme and render it on the product page:

```liquid
{% render 'diamondleaf-price-breakdown', product: product %}
```

### If you want a proper Shopify app block

1. Create a Shopify app with CLI.
2. Generate a theme app extension:

```bash
shopify app generate extension --template theme
```

3. Copy the files from `extensions/diamondleaf-price-breakdown/` into that generated extension.
4. Push the extension and add the block in Theme Customizer.

## Repricing from command line

You can also sync without opening the UI:

```bash
npm run sync
```

## Assumptions built into this version

- product pricing data is stored on the **product** as metafields
- all variants under one product should use the same calculated price
- GST is calculated on subtotal
- if `making_charges_gm` is filled, it overrides percentage-based making
- if `making_charges_gm` is empty, the app uses `% of gold value calculated at 24k gold rate` (making is always calculated on the 24k gold rate, regardless of product gold purity)

## Next recommended upgrade

If you want, the next step can be:

1. convert this into a full Shopify CLI embedded app
2. add webhook-based auto repricing when products/metafields change
3. add a Plus-only Cart Transform extension for hard checkout enforcement
