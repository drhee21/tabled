// The one file that maps preference options to Google place types, so
// "wanted" and "refused" cuisines match real data. Type names come from
// Table A of Google's Places API (New) place types.
import {
  CUISINE_VALUES,
  type CuisineValue,
  type DietaryValue,
} from "../preference-options";

/**
 * Google types for each cuisine option. The record is exhaustive, so adding a
 * cuisine to the form without mapping it here fails the type check.
 *
 * Overlaps are deliberate: a sushi place is also Japanese, so refusing
 * Japanese drops it.
 */
export const CUISINE_TYPES: Record<CuisineValue, readonly string[]> = {
  american: ["american_restaurant", "diner"],
  bbq: ["barbecue_restaurant"],
  burgers: ["hamburger_restaurant"],
  cafe: ["cafe", "coffee_shop"],
  chinese: [
    "chinese_restaurant",
    "cantonese_restaurant",
    "chinese_noodle_restaurant",
    "dim_sum_restaurant",
  ],
  french: ["french_restaurant"],
  indian: ["indian_restaurant", "north_indian_restaurant", "south_indian_restaurant"],
  italian: ["italian_restaurant"],
  japanese: [
    "japanese_restaurant",
    "ramen_restaurant",
    "sushi_restaurant",
    "japanese_curry_restaurant",
    "japanese_izakaya_restaurant",
    "tonkatsu_restaurant",
    "yakiniku_restaurant",
    "yakitori_restaurant",
  ],
  korean: ["korean_restaurant", "korean_barbecue_restaurant"],
  mediterranean: ["mediterranean_restaurant", "greek_restaurant"],
  mexican: [
    "mexican_restaurant",
    "taco_restaurant",
    "burrito_restaurant",
    "tex_mex_restaurant",
  ],
  "middle-eastern": [
    "middle_eastern_restaurant",
    "lebanese_restaurant",
    "persian_restaurant",
    "turkish_restaurant",
    "shawarma_restaurant",
    "falafel_restaurant",
    "israeli_restaurant",
  ],
  pizza: ["pizza_restaurant"],
  seafood: ["seafood_restaurant", "oyster_bar_restaurant", "fish_and_chips_restaurant"],
  sushi: ["sushi_restaurant"],
  thai: ["thai_restaurant"],
  vietnamese: ["vietnamese_restaurant"],
};

/**
 * Dietary needs that a Google type confirms. Google has no types for
 * gluten-free, dairy-free, nut-free or kosher, so those are never confirmed
 * and always leave a place marked dietary_unknown.
 */
export const DIETARY_TYPES: Partial<Record<DietaryValue, readonly string[]>> = {
  vegan: ["vegan_restaurant"],
  vegetarian: ["vegetarian_restaurant", "vegan_restaurant"],
  pescatarian: ["seafood_restaurant", "vegetarian_restaurant", "vegan_restaurant"],
  halal: ["halal_restaurant"],
};

/**
 * Every type in Google's "Food and Drink" group (Table A, as of Feb 2026).
 * A place whose main type is outside this set is not somewhere to eat, even if
 * Google also lists "restaurant" among its types (a hotel or parking garage
 * with a restaurant inside, for example).
 */
const FOOD_AND_DRINK_TYPES: ReadonlySet<string> = new Set(
  `acai_shop afghani_restaurant african_restaurant american_restaurant
  argentinian_restaurant asian_fusion_restaurant asian_restaurant australian_restaurant
  austrian_restaurant bagel_shop bakery bangladeshi_restaurant bar bar_and_grill
  barbecue_restaurant basque_restaurant bavarian_restaurant beer_garden belgian_restaurant
  bistro brazilian_restaurant breakfast_restaurant brewery brewpub british_restaurant
  brunch_restaurant buffet_restaurant burmese_restaurant burrito_restaurant cafe cafeteria
  cajun_restaurant cake_shop californian_restaurant cambodian_restaurant candy_store
  cantonese_restaurant caribbean_restaurant cat_cafe chicken_restaurant
  chicken_wings_restaurant chilean_restaurant chinese_noodle_restaurant chinese_restaurant
  chocolate_factory chocolate_shop cocktail_bar coffee_roastery coffee_shop coffee_stand
  colombian_restaurant confectionery croatian_restaurant cuban_restaurant czech_restaurant
  danish_restaurant deli dessert_restaurant dessert_shop dim_sum_restaurant diner dog_cafe
  donut_shop dumpling_restaurant dutch_restaurant eastern_european_restaurant
  ethiopian_restaurant european_restaurant falafel_restaurant family_restaurant
  fast_food_restaurant filipino_restaurant fine_dining_restaurant
  fish_and_chips_restaurant fondue_restaurant food_court french_restaurant fusion_restaurant
  gastropub german_restaurant greek_restaurant gyro_restaurant halal_restaurant
  hamburger_restaurant hawaiian_restaurant hookah_bar hot_dog_restaurant hot_dog_stand
  hot_pot_restaurant hungarian_restaurant ice_cream_shop indian_restaurant
  indonesian_restaurant irish_pub irish_restaurant israeli_restaurant italian_restaurant
  japanese_curry_restaurant japanese_izakaya_restaurant japanese_restaurant juice_shop
  kebab_shop korean_barbecue_restaurant korean_restaurant latin_american_restaurant
  lebanese_restaurant lounge_bar malaysian_restaurant meal_delivery meal_takeaway
  mediterranean_restaurant mexican_restaurant middle_eastern_restaurant
  mongolian_barbecue_restaurant moroccan_restaurant noodle_shop north_indian_restaurant
  oyster_bar_restaurant pakistani_restaurant pastry_shop persian_restaurant
  peruvian_restaurant pizza_delivery pizza_restaurant polish_restaurant
  portuguese_restaurant pub ramen_restaurant restaurant romanian_restaurant
  russian_restaurant salad_shop sandwich_shop scandinavian_restaurant seafood_restaurant
  shawarma_restaurant snack_bar soul_food_restaurant soup_restaurant
  south_american_restaurant south_indian_restaurant southwestern_us_restaurant
  spanish_restaurant sports_bar sri_lankan_restaurant steak_house sushi_restaurant
  swiss_restaurant taco_restaurant taiwanese_restaurant tapas_restaurant tea_house
  tex_mex_restaurant thai_restaurant tibetan_restaurant tonkatsu_restaurant
  turkish_restaurant ukrainian_restaurant vegan_restaurant vegetarian_restaurant
  vietnamese_restaurant western_restaurant wine_bar winery yakiniku_restaurant
  yakitori_restaurant`
    .split(/\s+/)
    .filter(Boolean),
);

/** True unless Google's main type for the place is something other than food or drink. */
export function isFoodPlace(primaryType: string | undefined): boolean {
  return primaryType === undefined || FOOD_AND_DRINK_TYPES.has(primaryType);
}

/**
 * Main types for places that only deliver, so there is nowhere to sit down.
 * Domino's, for example, is listed as `pizza_delivery`. Takeout counterparts
 * such as `meal_takeaway` are kept: you can still go and eat there.
 */
const DELIVERY_ONLY_TYPES: ReadonlySet<string> = new Set(["pizza_delivery", "meal_delivery"]);

/** True when Google's main type for the place is delivery only. */
export function isDeliveryOnly(primaryType: string | undefined): boolean {
  return primaryType !== undefined && DELIVERY_ONLY_TYPES.has(primaryType);
}

/** The generic type every search asks for. */
export const BASE_INCLUDED_TYPE = "restaurant";

/** Google allows at most 50 types per list. */
export const MAX_TYPES_PER_LIST = 50;

/** Cuisine options that a place's types fall under. */
export function cuisineTagsFromTypes(types: readonly string[]): CuisineValue[] {
  const have = new Set(types);
  return CUISINE_VALUES.filter((c) => CUISINE_TYPES[c].some((t) => have.has(t)));
}

/** Dietary needs that a place's types confirm. */
export function dietaryConfirmedFromTypes(types: readonly string[]): DietaryValue[] {
  const have = new Set(types);
  return (Object.keys(DIETARY_TYPES) as DietaryValue[]).filter((d) =>
    DIETARY_TYPES[d]?.some((t) => have.has(t)),
  );
}

/**
 * Types to send to the search. When the group wants specific cuisines, only
 * those cuisines' types are requested, so Google's 20 results are all places
 * someone wants instead of 20 general ones that get thrown away. With no
 * wanted cuisines it asks for restaurants in general.
 *
 * Refused types are excluded up front so they do not use up the 20 results,
 * and are left out of the included list because Google rejects a type that
 * appears in both. The code filters again, so this is an optimization and not
 * the rule. includedTypes can come back empty when everything wanted is
 * refused; the caller then has nothing to ask for.
 */
export function searchTypes(
  wanted: readonly CuisineValue[],
  refused: readonly CuisineValue[],
): { includedTypes: string[]; excludedTypes: string[] } {
  const excluded = new Set<string>(refused.flatMap((c) => CUISINE_TYPES[c]));

  const includedTypes =
    wanted.length === 0
      ? [BASE_INCLUDED_TYPE]
      : [...new Set(wanted.flatMap((c) => CUISINE_TYPES[c]))]
          .filter((t) => !excluded.has(t))
          .slice(0, MAX_TYPES_PER_LIST);

  return { includedTypes, excludedTypes: [...excluded].slice(0, MAX_TYPES_PER_LIST) };
}
