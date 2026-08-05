# Workflow contract

## Start input

Submit `profile` using the fields already accepted by AI 备餐教练. At minimum include `days`, `familySize`, and relevant constraints. Example:

```json
{
  "profile": {
    "days": 7,
    "familySize": 2,
    "targetCalories": 1800,
    "allergies": ["花生"],
    "pantry": ["鸡蛋", "番茄"]
  }
}
```

## Action: `adjust-meal`

Submit `mealKey`, `reason`, and optional text or JSON `constraints`. The adapter converts constraints to bounded text and always attaches the immutable original plan.

## Checkpoint: `weekly-execution`

Submit `executionState` and optional `feedback`. Only the bounded `planId`, `selectedDayIndex`, `shopping`, `prep`, `meals`, and normalized `replacements` fields are persisted. The project returns a review containing wins, frictions, next-week adjustments, and prompt hints.

## Grounding

Keep every returned ingredient `rag` field, `ragGuardrail`, meal `recipeRag`, and top-level `recipeRag.matches`. Ingredient nutrition comes from `ingredient-nutrition-rag`; matched recipes come from `menu-library-rag` with stable `menu:<id>` source IDs. An unmatched ingredient is a warning, not permission to silently delete a necessary item.
