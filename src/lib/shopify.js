const API_VERSION = "2025-10";
let accessTokenCache = null;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getShopifyConfig() {
  return {
    storeDomain: requireEnv("SHOPIFY_STORE_DOMAIN"),
    apiKey: requireEnv("SHOPIFY_API_KEY"),
    apiSecret: requireEnv("SHOPIFY_API_SECRET"),
    apiVersion: API_VERSION
  };
}

export async function shopifyGraphQL(query, variables = {}) {
  const { storeDomain, apiVersion } = getShopifyConfig();
  const accessToken = await getAdminAccessToken();
  const response = await fetch(
    `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query, variables })
    }
  );

  const body = await parseShopifyResponse(response);

  if (!response.ok || body.errors) {
    throw new Error(
      `Shopify GraphQL request failed: ${JSON.stringify(
        body.errors || body,
        null,
        2
      )}`
    );
  }

  return body.data;
}

export async function getAdminAccessToken() {
  if (isCachedTokenValid(accessTokenCache)) {
    return accessTokenCache.accessToken;
  }

  const { storeDomain, apiKey, apiSecret } = getShopifyConfig();
  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: apiKey,
      client_secret: apiSecret
    })
  });

  const body = await parseShopifyResponse(response, {
    fallbackContext:
      "Shopify token request failed. Check that the app is installed on this store, Admin API scopes are configured, and the Client ID/Secret are copied from the same Dev Dashboard app."
  });

  if (!response.ok || !body.access_token) {
    throw new Error(
      `Unable to get Shopify Admin access token: ${JSON.stringify(body, null, 2)}`
    );
  }

  accessTokenCache = {
    accessToken: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in || 0) * 1000
  };

  return accessTokenCache.accessToken;
}

export async function getShop() {
  const data = await shopifyGraphQL(`
    query ShopInfo {
      shop {
        id
        name
        myshopifyDomain
        plan {
          displayName
          partnerDevelopment
          shopifyPlus
        }
        currencyCode
      }
    }
  `);

  return data.shop;
}

function isCachedTokenValid(cache) {
  if (!cache?.accessToken || !cache?.expiresAt) {
    return false;
  }

  return cache.expiresAt - Date.now() > 60_000;
}

async function parseShopifyResponse(response, options = {}) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }

  const titleMatch = text.match(/<title>(.*?)<\/title>/i);
  const pageTitle = titleMatch?.[1]?.trim();

  throw new Error(
    [
      options.fallbackContext || "Shopify returned a non-JSON response.",
      `Status: ${response.status}`,
      pageTitle ? `Shopify page: ${pageTitle}` : null,
      "This usually means the store domain, app installation, app scopes, or Client ID/Secret do not match."
    ]
      .filter(Boolean)
      .join(" ")
  );
}
