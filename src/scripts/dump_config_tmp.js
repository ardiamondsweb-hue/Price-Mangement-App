import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shopifyGraphQL } from "../lib/shopify.js";
import { getPricingConfig } from "../lib/config-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  console.log("Querying Shopify store configuration...");
  try {
    const config = await getPricingConfig();
    console.log("Config loaded successfully.");
    console.log("Gold rates:", config.goldRates);
    console.log("GST:", config.gstPercent);
    console.log("Lab slabs:", config.labDiamondSlabs);

    const data = await shopifyGraphQL(`
      query {
        products(first: 50) {
          nodes {
            id
            title
            handle
            variants(first: 5) {
              nodes {
                id
                title
                price
              }
            }
            metafields(first: 50) {
              nodes {
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `);

    for (const product of data.products.nodes) {
      if (!product.title.toLowerCase().includes("tennis")) continue;
      console.log(`\nProduct: ${product.title} (${product.handle})`);
      console.log("Variants:");
      for (const variant of product.variants.nodes) {
        console.log(`  - ${variant.title}: ${variant.price}`);
      }
      console.log("Metafields:");
      for (const mf of product.metafields.nodes) {
        if (mf.namespace === "custom" || mf.namespace === "diamondleaf_pricing") {
          console.log(`  - [${mf.namespace}] ${mf.key}: ${mf.value} (${mf.type})`);
        }
      }
      console.log("-----------------------------------------");
    }
  } catch (error) {
    console.error("Error executing query:", error);
  }
}

main();
