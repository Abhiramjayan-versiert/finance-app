-- =============================================================================
-- FINANCE OS — Reference data (default categories, achievements, templates,
-- platform settings). Safe to re-run.
-- =============================================================================

insert into public.default_categories (kind, name, icon, color, sort_order) values
  ('expense', 'Food', 'utensils', '#F2B84B', 1),
  ('expense', 'Groceries', 'shopping-basket', '#39C982', 2),
  ('expense', 'Transportation', 'bus', '#5AA9F0', 3),
  ('expense', 'Fuel', 'fuel', '#F06B6B', 4),
  ('expense', 'Shopping', 'shopping-bag', '#C58AF9', 5),
  ('expense', 'Clothing', 'shirt', '#E58AC3', 6),
  ('expense', 'Entertainment', 'clapperboard', '#F59E6B', 7),
  ('expense', 'Subscriptions', 'repeat', '#8AB4F8', 8),
  ('expense', 'Education', 'graduation-cap', '#6BD4C8', 9),
  ('expense', 'Healthcare', 'heart-pulse', '#F07B9B', 10),
  ('expense', 'Rent', 'home', '#B7F34A', 11),
  ('expense', 'Electricity', 'zap', '#F2D24B', 12),
  ('expense', 'Internet', 'wifi', '#7BC6F0', 13),
  ('expense', 'Travel', 'plane', '#9C8AF9', 14),
  ('expense', 'Personal care', 'sparkles', '#F0A6CA', 15),
  ('expense', 'Fitness', 'dumbbell', '#4BD18A', 16),
  ('expense', 'Family', 'users', '#F2A44B', 17),
  ('expense', 'Business', 'briefcase', '#8FA3B8', 18),
  ('expense', 'Other', 'circle', '#A0A6AD', 19),
  ('income', 'Salary', 'wallet', '#39C982', 1),
  ('income', 'Freelancing', 'laptop', '#B7F34A', 2),
  ('income', 'Business income', 'briefcase', '#5AA9F0', 3),
  ('income', 'Agency income', 'building-2', '#9C8AF9', 4),
  ('income', 'Commission', 'percent', '#F2B84B', 5),
  ('income', 'Investments', 'trending-up', '#6BD4C8', 6),
  ('income', 'Rental income', 'key-round', '#F59E6B', 7),
  ('income', 'Other income', 'circle', '#A0A6AD', 8)
on conflict (kind, name) do nothing;

insert into public.achievements (code, name, description, icon, category, sort_order) values
  ('first_expense', 'First step', 'Recorded your first expense.', 'receipt', 'tracking', 1),
  ('first_income', 'Money in', 'Recorded your first income.', 'wallet', 'tracking', 2),
  ('first_goal', 'Dream it, plan it', 'Created your first financial goal.', 'target', 'goals', 3),
  ('saved_1000', 'First ₹1,000', 'Saved your first 1,000 in savings and goals.', 'piggy-bank', 'savings', 4),
  ('goal_completed', 'Goal crusher', 'Completed your first financial goal.', 'trophy', 'goals', 5),
  ('streak_7', 'Seven-day streak', 'Tracked money activity on 7 consecutive days.', 'flame', 'habits', 6),
  ('streak_30', 'Thirty-day streak', 'Tracked money activity on 30 consecutive days.', 'flame', 'habits', 7),
  ('within_budget', 'Budget keeper', 'Finished a month within your overall budget.', 'shield-check', 'budgets', 8),
  ('savings_rate_10', 'Ten percent club', 'Saved at least 10% of your income in a month.', 'percent', 'savings', 9),
  ('savings_rate_20', 'Twenty percent club', 'Saved at least 20% of your income in a month.', 'percent', 'savings', 10),
  ('emergency_fund', 'Safety net', 'Built an emergency fund covering 3 months of expenses.', 'life-buoy', 'savings', 11),
  ('saved_1_lakh', 'Lakh milestone', 'Reached 1,00,000 in savings and goals.', 'gem', 'savings', 12),
  ('debt_free', 'Debt free', 'Paid off every tracked debt.', 'badge-check', 'debt', 13),
  ('first_investment', 'Investor', 'Recorded your first investment.', 'trending-up', 'investing', 14)
on conflict (code) do nothing;

insert into public.notification_templates (key, title_template, body_template) values
  ('budget_warning', 'Budget alert: {{budget}}', 'You have used {{percent}}% of your {{budget}} budget for {{period}}.'),
  ('goal_deadline', 'Goal deadline approaching: {{goal}}', '{{goal}} is due on {{date}}. You still need {{remaining}}.'),
  ('goal_completed', 'Goal completed: {{goal}}', 'Congratulations! You reached your target for {{goal}}.'),
  ('emi_due', 'EMI due soon: {{debt}}', 'Your payment of {{amount}} for {{debt}} is due on {{date}}.'),
  ('recurring_upcoming', 'Upcoming recurring {{type}}: {{title}}', '{{title}} ({{amount}}) is scheduled for {{date}}.'),
  ('monthly_summary', 'Your {{month}} summary', 'Income {{income}}, expenses {{expenses}}, savings rate {{rate}}%.'),
  ('savings_milestone', 'Savings milestone reached', '{{account}} has reached {{percent}}% of its target.'),
  ('achievement_unlocked', 'Achievement unlocked: {{name}}', '{{description}}')
on conflict (key) do nothing;

insert into public.platform_settings (key, value, is_public, description) values
  ('maintenance_mode', 'false'::jsonb, true, 'When true, non-admin users see a maintenance page.'),
  ('maintenance_message', '"FINANCE OS is undergoing scheduled maintenance. Please check back shortly."'::jsonb, true, 'Message shown during maintenance.'),
  ('signups_enabled', 'true'::jsonb, true, 'When false, new registrations are rejected.'),
  ('announcement', '""'::jsonb, true, 'Optional banner shown to signed-in users.')
on conflict (key) do nothing;
