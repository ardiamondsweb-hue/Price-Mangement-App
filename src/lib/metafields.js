export function buildMetafieldIdentifiers(config) {
  const namespace = config.metafields.namespace;
  return Object.values(config.metafields.keys).map((key) => ({
    namespace,
    key
  }));
}

export function mapMetafieldsByKey(metafields = []) {
  const map = {};

  for (const metafield of metafields) {
    if (!metafield) {
      continue;
    }

    map[metafield.key] = metafield.value;
  }

  return map;
}

export function parseDecimal(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseInteger(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
