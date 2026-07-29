import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NUTRITION_INDEX_PATH = path.resolve(__dirname, "../../public/data/ingredient-nutrition-rag.json");

let cachedNutritionIndex = null;

export function loadLocalNutritionIndex() {
  if (!cachedNutritionIndex) {
    cachedNutritionIndex = JSON.parse(readFileSync(NUTRITION_INDEX_PATH, "utf8"));
  }
  return cachedNutritionIndex;
}
