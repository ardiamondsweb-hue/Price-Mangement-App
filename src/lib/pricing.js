import { parseDecimal, parseInteger } from "./metafields.js";

export function calculateProductPrice({ metafieldValues, config }) {
  const keys = config.metafields.keys;

  // 1. Parse all metafield inputs (defaulting to 0/NaN appropriately)
  const goldPurity = parseInteger(metafieldValues[keys.goldPurity]);
  const goldWeight = parseDecimal(metafieldValues[keys.goldWeightGm]);
  
  const stonePricePerCt = parseDecimal(
    metafieldValues[keys.stonePricePerCt],
    config.defaultStonePricePerCt
  );
  const stoneTotalWt = parseDecimal(metafieldValues[keys.stoneTotalWt]);
  
  const totalDiamondWeight = parseDecimal(metafieldValues[keys.totalDiamondWeight]);
  const numberOfDiamond = parseDecimal(metafieldValues[keys.numberOfDiamond]);
  
  const soliterWeight = parseDecimal(metafieldValues[keys.soliterWeight]);
  const numberOfSoliter = parseDecimal(metafieldValues[keys.numberOfSoliter]);
  
  const smallRoundWeight = parseDecimal(metafieldValues[keys.smallRoundWeight]);
  const numberOfSmallRound = parseDecimal(metafieldValues[keys.numberOfSmallRound]);
  
  const smallFancyWeight = parseDecimal(metafieldValues[keys.smallFancyWeight]);
  const numberOfSmallFancy = parseDecimal(metafieldValues[keys.numberOfSmallFancy]);

  const makingPercentMeta = parseDecimal(
    metafieldValues[keys.makingChargesInPercent],
    NaN
  );
  const makingPerGramMeta = parseDecimal(
    metafieldValues[keys.makingChargesPerGram],
    NaN
  );
  const naturalDiamondFlatPricePerCt = parseDecimal(
    metafieldValues[keys.naturalDiamondFlatPricePerCt],
    config.defaultNaturalDiamondFlatPricePerCt
  );

  // 2. G1: Gold Value
  const goldRate = parseDecimal(config.goldRates[String(goldPurity)]);
  const goldValue = goldRate * goldWeight;
  const goldRate24k = parseDecimal(config.goldRates["24"]) || goldRate;
  const goldValue24k = goldRate24k * goldWeight;

  // Determine Diamond Kind
  const diamondKind = detectDiamondKind(
    metafieldValues[keys.diamondType],
    metafieldValues[keys.diamondQuality]
  );

  const isLabGrown = (diamondKind === "lab-grown");

  // 1. Solitaire Value (SL)
  let soliterRate = 0;
  let soliterValue = 0;
  if (soliterWeight > 0) {
    soliterRate = isLabGrown
      ? getLabDiamondRate(soliterWeight, config.labDiamondSlabs)
      : naturalDiamondFlatPricePerCt;
    soliterValue = soliterRate * soliterWeight;
  }

  // 2. Small Round Diamond Value (SRD)
  let smallRoundRate = 0;
  let smallRoundValue = 0;
  if (smallRoundWeight > 0) {
    smallRoundRate = isLabGrown
      ? getLabDiamondRate(0.1, config.labDiamondSlabs)
      : naturalDiamondFlatPricePerCt;
    smallRoundValue = smallRoundRate * smallRoundWeight;
  }

  // 3. Small Fancy Diamond Value (SFD)
  let smallFancyRate = 0;
  let smallFancyValue = 0;
  if (smallFancyWeight > 0) {
    smallFancyRate = isLabGrown
      ? getLabDiamondRate(0.1, config.labDiamondSlabs)
      : naturalDiamondFlatPricePerCt;
    smallFancyValue = smallFancyRate * smallFancyWeight;
  }

  // 4. Main Diamond Value (ND / LD) - Calculate based on totalDiamondWeight directly
  let diamondValueND = 0;
  let diamondValueLD = 0;
  let mainDiamondRate = 0;

  if (totalDiamondWeight > 0) {
    if (isLabGrown) {
      mainDiamondRate = getLabDiamondRate(totalDiamondWeight, config.labDiamondSlabs);
      diamondValueLD = mainDiamondRate * totalDiamondWeight;
    } else {
      mainDiamondRate = naturalDiamondFlatPricePerCt;
      diamondValueND = mainDiamondRate * totalDiamondWeight;
    }
  }

  // 5. Stone Value (SI)
  const stoneValue = stoneTotalWt * stonePricePerCt;

  // 6. Making Charges (M)
  const makingPercent = Number.isFinite(makingPercentMeta)
    ? makingPercentMeta
    : config.defaultMakingPercent;

  const usesMakingPerGram = Number.isFinite(makingPerGramMeta);
  const makingValue = usesMakingPerGram
    ? makingPerGramMeta * goldWeight
    : goldValue24k * (makingPercent / 100);

  // 7. FP & GST & Grand Total
  const subtotal =
    goldValue +
    diamondValueND +
    soliterValue +
    diamondValueLD +
    smallRoundValue +
    smallFancyValue +
    stoneValue +
    makingValue;

  const gstPercent = parseDecimal(config.gstPercent);
  const gstValue = subtotal * (gstPercent / 100);
  const totalPrice = subtotal + gstValue;

  // Build Dynamic Formula
  const activeComponents = [];
  if (goldValue > 0) activeComponents.push("G1");
  if (diamondValueND > 0) activeComponents.push("ND");
  if (soliterValue > 0) activeComponents.push("SL");
  if (diamondValueLD > 0) activeComponents.push("LD");
  if (smallRoundValue > 0) activeComponents.push("SRD");
  if (smallFancyValue > 0) activeComponents.push("SFD");
  if (stoneValue > 0) activeComponents.push("SI");
  if (makingValue > 0) activeComponents.push("M");

  const formula = activeComponents.length > 0
    ? `${activeComponents.join(" + ")} + GST`
    : "GST";

  return {
    diamondKind: isLabGrown ? "lab-grown" : "natural",
    formula,
    components: {
      goldRate: round(goldRate),
      goldWeight: round(goldWeight),
      goldValue: round(goldValue),
      
      diamondRate: round(mainDiamondRate),
      diamondWeight: round(totalDiamondWeight),
      diamondValue: round(isLabGrown ? diamondValueLD : diamondValueND),

      soliterRate: round(soliterRate),
      soliterWeight: round(soliterWeight),
      soliterValue: round(soliterValue),

      smallRoundRate: round(smallRoundRate),
      smallRoundWeight: round(smallRoundWeight),
      smallRoundValue: round(smallRoundValue),

      smallFancyRate: round(smallFancyRate),
      smallFancyWeight: round(smallFancyWeight),
      smallFancyValue: round(smallFancyValue),

      stonePricePerCt: round(stonePricePerCt),
      stoneTotalWt: round(stoneTotalWt),
      stoneValue: round(stoneValue),

      makingPercent: round(makingPercent),
      makingValue: round(makingValue),
      gstPercent: round(gstPercent),
      gstValue: round(gstValue),
      subtotal: round(subtotal),
      totalPrice: round(totalPrice)
    },
    sourceMetafields: {
      goldPurity,
      naturalDiamondFlatPricePerCt: round(naturalDiamondFlatPricePerCt),
      makingChargesPerGram: round(makingPerGramMeta),
      makingCalculationType: usesMakingPerGram ? "per_gram" : "percent"
    }
  };
}

export function detectDiamondKind(diamondType, diamondQuality) {
  const input = `${diamondType || ""} ${diamondQuality || ""}`.toLowerCase();

  if (input.includes("lab")) {
    return "lab-grown";
  }

  return "natural";
}

export function getLabDiamondRate(weight, slabs) {
  const numericWeight = parseDecimal(weight);
  const slab =
    slabs.find(
      ({ min, max }) =>
        numericWeight >= parseDecimal(min) &&
        (max === null || numericWeight < parseDecimal(max))
    ) || slabs.at(-1);

  return parseDecimal(slab?.rate);
}

function round(value) {
  return Number.parseFloat((Number(value) || 0).toFixed(2));
}
