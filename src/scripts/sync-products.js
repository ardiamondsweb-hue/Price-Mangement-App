import dotenv from "dotenv";
import { getPricingConfig } from "../lib/config-store.js";
import { repriceAllProducts } from "../services/product-pricing-service.js";

dotenv.config();

const config = await getPricingConfig();
const results = await repriceAllProducts(config);

console.table(results);
