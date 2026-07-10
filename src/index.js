import dotenv from "dotenv";
import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPricingConfig, savePricingConfig } from "./lib/config-store.js";
import { getShop } from "./lib/shopify.js";
import { repriceAllProducts } from "./services/product-pricing-service.js";

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/assets", express.static(path.join(__dirname, "../assets")));
app.use(loginAuthIfEnabled);

app.get("/login", (req, res) => {
  res.render("login", {
    title: "Login",
    error: req.query.error === "1"
  });
});

app.post("/login", (req, res) => {
  const password = process.env.APP_PASSWORD;

  if (!password) {
    res.redirect("/");
    return;
  }

  if (!isPasswordValid(req.body.password || "", password)) {
    res.redirect("/login?error=1");
    return;
  }

  res.setHeader("Set-Cookie", buildAuthCookie(password));
  res.redirect("/");
});

app.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearAuthCookie());
  res.redirect("/login");
});

app.get("/", async (req, res, next) => {
  try {
    const [shop, config] = await Promise.all([getShop(), getPricingConfig()]);
    res.render("dashboard", {
      shop,
      config,
      title: "Diamondleaf Pricing App",
      saved: req.query.saved === "1",
      ratesSaved: req.query.ratesSaved === "1",
      passwordProtected: Boolean(process.env.APP_PASSWORD)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/daily-rates", async (req, res, next) => {
  try {
    const currentConfig = await getPricingConfig();
    const nextConfig = {
      ...currentConfig,
      lastManualUpdateAt: new Date().toISOString(),
      gstPercent: parseNumber(req.body.gstPercent, currentConfig.gstPercent),
      defaultMakingPercent: parseNumber(
        req.body.defaultMakingPercent,
        currentConfig.defaultMakingPercent
      ),
      defaultNaturalDiamondFlatPricePerCt: parseNumber(
        req.body.defaultNaturalDiamondFlatPricePerCt,
        currentConfig.defaultNaturalDiamondFlatPricePerCt
      ),
      defaultStonePricePerCt: parseNumber(
        req.body.defaultStonePricePerCt,
        currentConfig.defaultStonePricePerCt
      ),
      goldRates: {
        ...currentConfig.goldRates,
        "9": parseNumber(req.body.goldRate9, currentConfig.goldRates["9"]),
        "14": parseNumber(req.body.goldRate14, currentConfig.goldRates["14"]),
        "18": parseNumber(req.body.goldRate18, currentConfig.goldRates["18"]),
        "22": parseNumber(req.body.goldRate22, currentConfig.goldRates["22"]),
        "24": parseNumber(req.body.goldRate24, currentConfig.goldRates["24"])
      },
      labDiamondSlabs: [
        buildLabSlab(0, 0.5, req.body.labRate0to05, currentConfig.labDiamondSlabs[0]?.rate),
        buildLabSlab(0.5, 1, req.body.labRate05to1, currentConfig.labDiamondSlabs[1]?.rate),
        buildLabSlab(1, 1.5, req.body.labRate1to15, currentConfig.labDiamondSlabs[2]?.rate),
        buildLabSlab(1.5, 2, req.body.labRate15to2, currentConfig.labDiamondSlabs[3]?.rate),
        buildLabSlab(2, 3, req.body.labRate2to3, currentConfig.labDiamondSlabs[4]?.rate),
        buildLabSlab(3, null, req.body.labRate3Above, currentConfig.labDiamondSlabs[5]?.rate)
      ]
    };

    await savePricingConfig(nextConfig);
    res.redirect("/?ratesSaved=1");
  } catch (error) {
    next(error);
  }
});

app.get("/settings", async (req, res, next) => {
  try {
    const config = await getPricingConfig();
    res.render("settings", {
      title: "Pricing Settings",
      config,
      configJson: JSON.stringify(config, null, 2),
      error: null
    });
  } catch (error) {
    next(error);
  }
});

app.post("/settings", async (req, res) => {
  try {
    const parsed = JSON.parse(req.body.configJson);
    await savePricingConfig(parsed);
    res.redirect("/?saved=1");
  } catch (error) {
    const config = await getPricingConfig();
    res.status(400).render("settings", {
      title: "Pricing Settings",
      config,
      configJson: req.body.configJson,
      error: error.message
    });
  }
});

app.post("/reprice", async (req, res, next) => {
  try {
    const config = await getPricingConfig();
    const results = await repriceAllProducts(config);
    res.render("reprice-result", {
      title: "Repricing Result",
      results
    });
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  res.status(500).render("error", {
    title: "Error",
    error
  });
});

// Local development only — Vercel invokes the exported app directly
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Diamondleaf pricing app running at http://localhost:${port}`);
  });
}

export default app;

function loginAuthIfEnabled(req, res, next) {
  const password = process.env.APP_PASSWORD;

  if (!password) {
    next();
    return;
  }

  if (req.path === "/login" || req.path === "/health") {
    next();
    return;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const isAuthenticated = cookies.diamondleaf_auth === createAuthToken(password);

  if (!isAuthenticated) {
    res.redirect("/login");
    return;
  }

  next();
}

function parseNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildLabSlab(min, max, rateValue, fallbackRate) {
  return {
    min,
    max,
    rate: parseNumber(rateValue, fallbackRate)
  };
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
        const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";
        return [key, decodeURIComponent(value)];
      })
  );
}

function createAuthToken(password) {
  return crypto
    .createHash("sha256")
    .update(`${password}:${process.env.SHOPIFY_STORE_DOMAIN || "diamondleaf"}`)
    .digest("hex");
}

function buildAuthCookie(password) {
  return [
    `diamondleaf_auth=${createAuthToken(password)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=2592000"
  ].join("; ");
}

function clearAuthCookie() {
  return "diamondleaf_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function isPasswordValid(inputPassword, expectedPassword) {
  const inputBuffer = Buffer.from(inputPassword);
  const expectedBuffer = Buffer.from(expectedPassword);

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}
