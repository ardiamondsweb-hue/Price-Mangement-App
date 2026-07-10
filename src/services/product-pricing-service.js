import { DEFAULT_APP_NAMESPACE } from "../config/defaults.js";
import { mapMetafieldsByKey } from "../lib/metafields.js";
import { calculateProductPrice } from "../lib/pricing.js";
import { shopifyGraphQL } from "../lib/shopify.js";

export async function repriceAllProducts(config) {
  const metafieldSelection = buildProductMetafieldSelection(config);
  const results = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphQL(
      `
        query ProductsForPricing(
          $first: Int!
          $after: String
          $namespace: String!
        ) {
          products(first: $first, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              handle
              ${metafieldSelection}
              total_value: metafield(namespace: "diamondleaf_pricing", key: "total_value") {
                value
              }
              variants(first: 250) {
                nodes {
                  id
                  title
                  sku
                  price
                }
              }
            }
          }
        }
      `,
      {
        first: 50,
        after: cursor,
        namespace: config.metafields.namespace
      }
    );

    const products = data.products.nodes;

    // Process products in the current page concurrently with a pool limit of 10
    const pageResults = await pool(products, 10, async (product) =>
      repriceSingleProduct({
        product,
        config
      })
    );

    // Collect metafield updates from all updated products
    const allMetafieldsToSet = pageResults
      .filter((res) => res.status === "updated" && res.metafields && res.metafields.length > 0)
      .flatMap((res) => res.metafields);

    // Batch save all metafields in chunks of 200 to Shopify
    if (allMetafieldsToSet.length > 0) {
      await saveMetafieldsInChunks(allMetafieldsToSet);
    }

    results.push(...pageResults);

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }

  return results;
}

export async function repriceSingleProduct({ product, config }) {
  try {
    const metafieldValues = mapMetafieldsByKey(
      extractProductMetafields(product, config)
    );

    // 1. Safety Check: Skip products without key jewelry weights/metafields to prevent overwriting prices to 0.00
    const goldWeightKey = config.metafields.keys.goldWeightGm;
    const diamondWeightKey = config.metafields.keys.totalDiamondWeight;
    const stoneTotalWtKey = config.metafields.keys.stoneTotalWt;
    const soliterWeightKey = config.metafields.keys.soliterWeight;
    const smallRoundWeightKey = config.metafields.keys.smallRoundWeight;
    const smallFancyWeightKey = config.metafields.keys.smallFancyWeight;

    const hasMaterials =
      Number.parseFloat(metafieldValues[goldWeightKey] || "0") > 0 ||
      Number.parseFloat(metafieldValues[diamondWeightKey] || "0") > 0 ||
      Number.parseFloat(metafieldValues[stoneTotalWtKey] || "0") > 0 ||
      Number.parseFloat(metafieldValues[soliterWeightKey] || "0") > 0 ||
      Number.parseFloat(metafieldValues[smallRoundWeightKey] || "0") > 0 ||
      Number.parseFloat(metafieldValues[smallFancyWeightKey] || "0") > 0;

    if (!hasMaterials) {
      return {
        productTitle: product.title,
        handle: product.handle,
        status: "skipped",
        reason: "No material weights found",
        metafields: []
      };
    }

    // 2. Perform price calculations
    const breakdown = calculateProductPrice({ metafieldValues, config });
    const newPrice = breakdown.components.totalPrice.toFixed(2);

    // 3. Cache/Sync Check: If prices and total_value metafield are already correct, skip API mutations
    const currentPriceMatch = product.variants.nodes.every(
      (variant) => Number.parseFloat(variant.price || "0").toFixed(2) === newPrice
    );
    const metafieldMatch =
      product.total_value &&
      Number.parseFloat(product.total_value.value || "0").toFixed(2) === newPrice;

    if (currentPriceMatch && metafieldMatch) {
      return {
        productTitle: product.title,
        handle: product.handle,
        status: "unchanged",
        totalPrice: newPrice,
        diamondKind: breakdown.diamondKind,
        formula: breakdown.formula,
        metafields: []
      };
    }

    // 4. Update product variant prices in Shopify
    const variantInputs = product.variants.nodes.map((variant) => ({
      id: variant.id,
      price: newPrice
    }));

    const variantUpdateData = await shopifyGraphQL(
      `
        mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        productId: product.id,
        variants: variantInputs
      }
    );

    if (variantUpdateData.productVariantsBulkUpdate.userErrors.length > 0) {
      return {
        productTitle: product.title,
        handle: product.handle,
        status: "error",
        error: JSON.stringify(
          variantUpdateData.productVariantsBulkUpdate.userErrors,
          null,
          2
        ),
        metafields: []
      };
    }

    // 5. Return status and computed metafields to be batched
    return {
      productTitle: product.title,
      handle: product.handle,
      status: "updated",
      totalPrice: newPrice,
      diamondKind: breakdown.diamondKind,
      formula: breakdown.formula,
      metafields: buildBreakdownMetafields(product.id, breakdown)
    };
  } catch (error) {
    return {
      productTitle: product.title,
      handle: product.handle,
      status: "error",
      error: error.message || String(error),
      metafields: []
    };
  }
}

function buildProductMetafieldSelection(config) {
  return Object.entries(config.metafields.keys)
    .map(
      ([name, key]) =>
        `${createMetafieldAlias(name)}: metafield(namespace: $namespace, key: ${JSON.stringify(
          key
        )}) { key namespace value }`
    )
    .join("\n");
}

function extractProductMetafields(product, config) {
  return Object.keys(config.metafields.keys)
    .map((name) => product[createMetafieldAlias(name)])
    .filter(Boolean);
}

function createMetafieldAlias(name) {
  return `mf_${String(name).replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

async function pool(items, concurrency, fn) {
  const results = [];
  const queue = [...items];

  const worker = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      const res = await fn(item);
      results.push(res);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }).map(worker);
  await Promise.all(workers);
  return results;
}

async function saveMetafieldsInChunks(metafields) {
  const chunkSize = 25;
  for (let i = 0; i < metafields.length; i += chunkSize) {
    const chunk = metafields.slice(i, i + chunkSize);
    const data = await shopifyGraphQL(
      `
        mutation SaveBreakdown($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              key
              namespace
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      { metafields: chunk }
    );

    if (data.metafieldsSet.userErrors.length > 0) {
      console.error(
        "Shopify metafieldsSet user errors:",
        JSON.stringify(data.metafieldsSet.userErrors, null, 2)
      );
    }
  }
}

function buildBreakdownMetafields(ownerId, breakdown) {
  const { components } = breakdown;

  return [
    numberMetafield(ownerId, "gold_value", components.goldValue),
    numberMetafield(ownerId, "diamond_value", components.diamondValue),
    numberMetafield(ownerId, "stone_value", components.stoneValue),
    numberMetafield(ownerId, "making_value", components.makingValue),
    numberMetafield(ownerId, "gst_value", components.gstValue),
    numberMetafield(ownerId, "subtotal_value", components.subtotal),
    numberMetafield(ownerId, "total_value", components.totalPrice),
    textMetafield(ownerId, "diamond_kind", breakdown.diamondKind),
    textMetafield(
      ownerId,
      "diamond_kind_label",
      breakdown.diamondKind === "lab-grown" ? "Lab Grown Diamond" : "Natural Diamond"
    ),
    textMetafield(ownerId, "formula_label", breakdown.formula),
    {
      ownerId,
      namespace: DEFAULT_APP_NAMESPACE,
      key: "breakdown_json",
      type: "json",
      value: JSON.stringify(breakdown)
    }
  ];
}

function numberMetafield(ownerId, key, value) {
  return {
    ownerId,
    namespace: DEFAULT_APP_NAMESPACE,
    key,
    type: "number_decimal",
    value: value.toFixed(2)
  };
}

function textMetafield(ownerId, key, value) {
  return {
    ownerId,
    namespace: DEFAULT_APP_NAMESPACE,
    key,
    type: "single_line_text_field",
    value
  };
}
