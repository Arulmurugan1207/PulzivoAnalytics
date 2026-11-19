/** Plan chosen on a pricing card, carried through /signup into onboarding. */

export const INTENT_PLAN_KEY = 'pulz_intent_plan';

const PLANS = new Set(['free', 'starter', 'pro', 'enterprise']);

export type IntentPlan = 'free' | 'starter' | 'pro' | 'enterprise';

export function normalizePlan(value: unknown): IntentPlan | null {
  const plan = String(value ?? '').trim().toLowerCase();
  return PLANS.has(plan) ? (plan as IntentPlan) : null;
}

export function rememberIntentPlan(value: unknown): IntentPlan | null {
  const plan = normalizePlan(value);
  if (!plan) return null;
  try {
    sessionStorage.setItem(INTENT_PLAN_KEY, plan);
  } catch {
    // Private mode can block sessionStorage. The query param still carries the plan.
  }
  return plan;
}

export function readIntentPlan(): IntentPlan | null {
  try {
    return normalizePlan(sessionStorage.getItem(INTENT_PLAN_KEY));
  } catch {
    return null;
  }
}
