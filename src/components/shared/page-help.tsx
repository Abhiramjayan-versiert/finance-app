import type { ReactNode } from "react";

/**
 * Plain-language explanations shown in each page's "How this page works"
 * panel. Written for someone who has never used a finance app before.
 */
export const HELP: Record<string, ReactNode> = {
  transactions: (
    <>
      <p>This is the full list of every income and expense you&apos;ve recorded. Use the search box and filters to find anything.</p>
      <ul>
        <li>Tap <b>Add income</b> or <b>Add expense</b> to record something new.</li>
        <li>Use the <b>⋯</b> menu on a row to edit, duplicate or delete it.</li>
        <li>Have a bank statement? <b>Import</b> a CSV file to add many entries at once — duplicates are skipped automatically.</li>
        <li>The recurring view shows bills and salary that repeat on a schedule.</li>
      </ul>
    </>
  ),
  import: (
    <>
      <p>Download a CSV statement from your bank&apos;s website or app, then upload it here.</p>
      <ul>
        <li>Match each column (date, description, amount) — we guess the common ones for you.</li>
        <li>Check the preview, then import. Running the same file twice never creates duplicates.</li>
      </ul>
    </>
  ),
  income: (
    <>
      <p>Record all the money you receive — salary, freelance work, rent, gifts, refunds.</p>
      <ul>
        <li>Mark something as <b>expected</b> if it hasn&apos;t arrived yet. Expected money is shown separately and is never counted as cash you have.</li>
        <li>Salary that arrives every month? Tick <b>This repeats</b> when adding it and it will be recorded for you each time.</li>
      </ul>
    </>
  ),
  expenses: (
    <>
      <p>See where your money goes. Use the arrows to move between periods, and the tabs to switch between week, month and year.</p>
      <ul>
        <li>Pick a <b>category</b> for each expense — it powers your budgets and charts.</li>
        <li>You can attach a photo of the receipt when adding an expense.</li>
      </ul>
    </>
  ),
  budgets: (
    <>
      <p>A budget is a spending limit. Create one overall budget for the month, and optional ones for categories like food or shopping.</p>
      <ul>
        <li>The bar fills up as you spend. It turns amber near the limit and red when you go over.</li>
        <li>You get a notification before you overspend.</li>
        <li>Budgets only count expenses — money moved to savings or goals does not use up a budget.</li>
      </ul>
    </>
  ),
  goals: (
    <>
      <p>A goal is something you&apos;re saving for — a phone, a trip, a wedding, a house deposit.</p>
      <ul>
        <li>Enter what it costs and when you want it. We work out exactly how much to put aside per day, week and month.</li>
        <li>Open a goal and press <b>Add money</b> whenever you save towards it. The progress bar and plan update instantly.</li>
        <li>If you fall behind, the goal is marked <b>at risk</b> so you can adjust.</li>
      </ul>
    </>
  ),
  savings: (
    <>
      <p>Savings pots are labelled jars for money you set aside — for example an emergency fund or a holiday fund.</p>
      <ul>
        <li><b>Add</b> moves money from your available balance into a pot. <b>Withdraw</b> moves it back.</li>
        <li><b>Transfer</b> moves money between two pots.</li>
        <li>Moving money into savings is not an expense — it&apos;s still yours.</li>
      </ul>
    </>
  ),
  investments: (
    <>
      <p>Keep track of mutual funds, stocks, gold, fixed deposits, crypto and more.</p>
      <ul>
        <li>Enter how much you put in and what it&apos;s worth today. Update the value whenever you like.</li>
        <li>We don&apos;t connect to any broker or fetch prices — your data stays private.</li>
      </ul>
    </>
  ),
  debts: (
    <>
      <p>Add any loan or credit card you&apos;re paying off — home, car, personal, education, or money owed to friends.</p>
      <ul>
        <li>Each time you pay, press <b>Record payment</b>. We split it into interest and principal and reduce what you owe.</li>
        <li>Add the EMI due date and it appears in &ldquo;Coming up&rdquo; on your overview.</li>
      </ul>
    </>
  ),
  networth: (
    <>
      <p>Net worth is <b>everything you own minus everything you owe</b>. It&apos;s the single best number for tracking long-term progress.</p>
      <ul>
        <li>It adds up your cash, savings, goal money and investments, plus any other assets (like property) you add here.</li>
        <li>Save a monthly snapshot to see your trend over time.</li>
      </ul>
    </>
  ),
  calculators: (
    <>
      <p>Quick &ldquo;what if&rdquo; tools. Pick a calculator, change the numbers, and the answer updates as you type.</p>
      <p>Nothing here changes your records — it&apos;s safe to experiment.</p>
    </>
  ),
  reports: (
    <>
      <p>Choose a report type and date range to see charts and tables built from your records.</p>
      <p>Use the download buttons to save a <b>PDF</b>, <b>Excel</b> or <b>CSV</b> copy — handy for taxes or sharing with family.</p>
    </>
  ),
  achievements: (
    <>
      <p>Badges you earn for good habits, like tracking every day or finishing a goal. They&apos;re based only on what you actually do.</p>
    </>
  ),
  notifications: (
    <>
      <p>Reminders about upcoming bills and EMIs, budgets nearing their limit, and goals that need attention.</p>
      <p>Choose which ones you get under <b>Preferences</b>.</p>
    </>
  ),
  settings: (
    <>
      <p>Set your name, currency, date format and default payment method. You can also edit categories, change your password, download all your data, or delete your account.</p>
    </>
  ),
};
