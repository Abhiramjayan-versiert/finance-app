/** Reference data shipped with the app (admins can extend categories/templates in Firestore). */

export const DEFAULT_EXPENSE_CATEGORIES: Array<[name: string, color: string]> = [
  ["Food", "#F2B84B"], ["Groceries", "#39C982"], ["Transportation", "#5AA9F0"], ["Fuel", "#F06B6B"], ["Shopping", "#C58AF9"], ["Clothing", "#E58AC3"],
  ["Entertainment", "#F59E6B"], ["Subscriptions", "#8AB4F8"], ["Education", "#6BD4C8"], ["Healthcare", "#F07B9B"], ["Rent", "#B7F34A"], ["Electricity", "#F2D24B"],
  ["Internet", "#7BC6F0"], ["Travel", "#9C8AF9"], ["Personal care", "#F0A6CA"], ["Fitness", "#4BD18A"], ["Family", "#F2A44B"], ["Business", "#8FA3B8"], ["Other", "#A0A6AD"],
];

export const DEFAULT_INCOME_CATEGORIES: Array<[name: string, color: string]> = [
  ["Salary", "#39C982"], ["Freelancing", "#B7F34A"], ["Business income", "#5AA9F0"], ["Agency income", "#9C8AF9"], ["Commission", "#F2B84B"], ["Investments", "#6BD4C8"], ["Rental income", "#F59E6B"], ["Other income", "#A0A6AD"],
];

export const ACHIEVEMENTS = [
  { code: "first_expense", name: "First step", description: "Recorded your first expense.", icon: "receipt" },
  { code: "first_income", name: "Money in", description: "Recorded your first income.", icon: "wallet" },
  { code: "first_goal", name: "Dream it, plan it", description: "Created your first financial goal.", icon: "target" },
  { code: "saved_1000", name: "First ₹1,000", description: "Saved your first 1,000 in savings and goals.", icon: "piggy-bank" },
  { code: "goal_completed", name: "Goal crusher", description: "Completed your first financial goal.", icon: "trophy" },
  { code: "streak_7", name: "Seven-day streak", description: "Tracked money activity on 7 consecutive days.", icon: "flame" },
  { code: "streak_30", name: "Thirty-day streak", description: "Tracked money activity on 30 consecutive days.", icon: "flame" },
  { code: "within_budget", name: "Budget keeper", description: "Finished a month within your overall budget.", icon: "shield-check" },
  { code: "savings_rate_10", name: "Ten percent club", description: "Saved at least 10% of your income in a month.", icon: "percent" },
  { code: "savings_rate_20", name: "Twenty percent club", description: "Saved at least 20% of your income in a month.", icon: "percent" },
  { code: "emergency_fund", name: "Safety net", description: "Built an emergency fund covering 3 months of expenses.", icon: "life-buoy" },
  { code: "saved_1_lakh", name: "Lakh milestone", description: "Reached 1,00,000 in savings and goals.", icon: "gem" },
  { code: "debt_free", name: "Debt free", description: "Paid off every tracked debt.", icon: "badge-check" },
  { code: "first_investment", name: "Investor", description: "Recorded your first investment.", icon: "trending-up" },
] as const;

export const DEFAULT_TEMPLATES: Record<string, { title: string; body: string }> = {
  budget_warning: { title: "Budget alert: {{budget}}", body: "You have used {{percent}}% of your {{budget}} budget for {{period}}." },
  goal_deadline: { title: "Goal deadline approaching: {{goal}}", body: "{{goal}} is due on {{date}}. You still need {{remaining}}." },
  goal_completed: { title: "Goal completed: {{goal}}", body: "Congratulations! You reached your target for {{goal}}." },
  emi_due: { title: "EMI due soon: {{debt}}", body: "Your payment of {{amount}} for {{debt}} is due on {{date}}." },
  recurring_upcoming: { title: "Upcoming recurring {{type}}: {{title}}", body: "{{title}} ({{amount}}) is scheduled for {{date}}." },
  monthly_summary: { title: "Your {{month}} summary", body: "Income {{income}}, expenses {{expenses}}, savings rate {{rate}}%." },
  savings_milestone: { title: "Savings milestone reached", body: "{{account}} has reached {{percent}}% of its target." },
  achievement_unlocked: { title: "Achievement unlocked: {{name}}", body: "{{description}}" },
};

export const DEFAULT_PLATFORM_SETTINGS = {
  maintenance_mode: false,
  maintenance_message: "FINANCE OS is undergoing scheduled maintenance. Please check back shortly.",
  signups_enabled: true,
  announcement: "",
};

export const DEFAULT_NOTIFICATION_PREFS = { budget_warnings: true, goal_deadlines: true, emi_reminders: true, recurring_reminders: true, monthly_summary: true, milestones: true, email: false };
