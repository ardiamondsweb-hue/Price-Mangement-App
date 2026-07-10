export const DEFAULT_APP_NAMESPACE = "diamondleaf_pricing";

export const defaultPricingConfig = {
  currencyCode: process.env.DEFAULT_CURRENCY || "INR",
  lastManualUpdateAt: null,
  gstPercent: 3,
  defaultMakingPercent: 25,
  defaultNaturalDiamondFlatPricePerCt: 0,
  defaultStonePricePerCt: 300,
  goldRates: {
    "9": 0,
    "14": 0,
    "18": 0,
    "22": 0,
    "24": 9142.22
  },
  labDiamondSlabs: [
    { min: 0, max: 0.5, rate: 17000 },
    { min: 0.5, max: 1, rate: 21000 },
    { min: 1, max: 1.5, rate: 25000 },
    { min: 1.5, max: 2, rate: 30000 },
    { min: 2, max: 3, rate: 35000 },
    { min: 3, max: null, rate: 40000 }
  ],
  metafields: {
    namespace: "custom",
    keys: {
      diamondQuality: "diamond_quality",
      diamondType: "diamond_type",
      goldWeightGm: "gold_weight_gm",
      goldPurity: "gold_purity",
      stonePricePerCt: "stone_price_ct",
      stoneTotalWt: "stone_total_wt",
      totalDiamondWeight: "total_diamond_weight",
      makingChargesInPercent: "making_charges_in",
      makingChargesPerGram: "making_charges_gm",
      naturalDiamondFlatPricePerCt: "natural_diamond_price_ct",
      productTotalWeight: "product_total_weight",
      categories: "categories",
      stoneTotalPcs: "stone_total_pcs",
      diamondCertification: "diamond_certification",
      diamondPurity: "diamond_purity",
      diamondShape: "diamond_shape",
      diamondColour: "diamond_colour",
      numberOfDiamond: "number_of_diamond",
      goldColour: "gold_colour",
      skuCode: "sku_code",
      smallFancyClarity: "small_fancy_clarity",
      numberOfSmallFancy: "number_of_small_fancy",
      smallFancyColour: "small_fancy_colour",
      smallFancyWeight: "small_fancy_weight",
      numberOfSmallRound: "number_of_small_round",
      smallRoundColour: "samll_round_colour",
      smallRoundClarity: "small_round_clarity",
      smallRoundWeight: "small_round_weight",
      numberOfSoliter: "number_of_soliter",
      soliterClarity: "soliter_clarity",
      soliterShape: "soliter_shape",
      soliterColour: "soliter_colour",
      soliterWeight: "soliter_weight"
    }
  }
};
