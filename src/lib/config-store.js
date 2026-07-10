import { DEFAULT_APP_NAMESPACE, defaultPricingConfig } from "../config/defaults.js";
import { getShop, shopifyGraphQL } from "./shopify.js";

const SETTINGS_KEY = "settings";

export async function getPricingConfig() {
  const data = await shopifyGraphQL(
    `
      query GetSettings($namespace: String!, $key: String!) {
        shop {
          metafield(namespace: $namespace, key: $key) {
            value
          }
        }
      }
    `,
    {
      namespace: DEFAULT_APP_NAMESPACE,
      key: SETTINGS_KEY
    }
  );

  const rawValue = data.shop.metafield?.value;
  if (!rawValue) {
    return structuredClone(defaultPricingConfig);
  }

  return mergeDeep(structuredClone(defaultPricingConfig), JSON.parse(rawValue));
}

export async function savePricingConfig(nextConfig) {
  const shop = await getShop();
  const config = mergeDeep(structuredClone(defaultPricingConfig), nextConfig);

  const data = await shopifyGraphQL(
    `
      mutation SaveSettings($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
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
    {
      metafields: [
        {
          ownerId: shop.id,
          namespace: DEFAULT_APP_NAMESPACE,
          key: SETTINGS_KEY,
          type: "json",
          value: JSON.stringify(config)
        }
      ]
    }
  );

  const errors = data.metafieldsSet.userErrors;
  if (errors.length > 0) {
    throw new Error(`Unable to save config: ${JSON.stringify(errors, null, 2)}`);
  }

  return config;
}

function mergeDeep(base, source) {
  for (const [key, value] of Object.entries(source || {})) {
    if (isObject(value) && isObject(base[key])) {
      mergeDeep(base[key], value);
    } else {
      base[key] = value;
    }
  }

  return base;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
