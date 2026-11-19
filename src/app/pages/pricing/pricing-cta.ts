export interface PlanCtaInput {
  loggedIn: boolean;
  planType: string;
  planPrice: number;
  currentPlanType: string;
  currentPlanPrice: number;
}

/** Logged-out visitors get a signup CTA. Logged-in visitors keep plan actions. */
export function planButtonLabel(input: PlanCtaInput): string {
  if (!input.loggedIn) return 'Get started free';
  if (input.planType === input.currentPlanType) return 'Current Plan';
  if (input.planPrice === 0) return 'Get Started Free';
  if (input.planPrice > input.currentPlanPrice) return 'Upgrade';
  return 'Select';
}

export function planButtonDisabled(input: PlanCtaInput): boolean {
  return input.loggedIn && input.planType === input.currentPlanType;
}
