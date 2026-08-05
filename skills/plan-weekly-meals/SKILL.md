---
name: plan-weekly-meals
description: Build, adjust, execute, and review a weekly meal-prep plan grounded in the AI HUB cooking project's nutrition index and 500-recipe library. Use when a household needs a multi-day plan, shopping and batch-prep steps, emergency substitutions, or a feedback loop for the next week; do not use as medical nutrition treatment.
---

# Plan Weekly Meals

1. Collect household size, days, goals, budget, allergies, dislikes, available ingredients, equipment, and time constraints.
2. Generate a complete plan through the cooking project so its local nutrition and recipe indexes remain authoritative.
3. Preserve ingredient-level RAG metadata and unmatched-item warnings.
4. Pause while the household executes the plan.
5. Use the `adjust-meal` action for substitutions; never silently rewrite the original plan.
6. Submit execution state and feedback to produce a weekly review and next-week hints.

Treat calories and nutrients as estimates. Preserve allergy constraints and recommend professional review for medical diets, pregnancy, eating disorders, or serious chronic conditions.

Read [references/contracts.md](references/contracts.md) for the workflow and action payloads.
