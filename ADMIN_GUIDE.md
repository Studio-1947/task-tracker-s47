# Task Tracker Administrator Guide

Welcome to the Task Tracker Administrative manual! This guide answers common questions about how our deterministic leave logic handles edge cases and monthly accruals, so you can configure policies with confidence.

## How Monthly Leave Accrual Works

Instead of running a fragile "background cron job" to add leave every month, this system calculates leave natively, accurately, and "on the fly."

### Example 1: Standard Monthly Accrual
**Rule**: An employee earns `1.5` days of Earned Leave (EL) per month.
- **Accrual Setup**: `Default Balance: 0`, `Accrual Per Month: 1.5`
- **What happens?**: On January 1st, they have `1.5` days. On February 1st, they automatically have `3.0` days. If they request 2 days of leave in mid-January, the system correctly checks if they have enough balance. 

### Example 2: Mid-Year Joiners
The system automatically prorates leave based on the employee's `Joined On` date.
- If an employee joins in **March**, they will not receive the January or February accruals. On March 1st, their balance will accurately reflect `1.5` days.

## Understanding Carry-Forward (Rollover) Rules

You can strictly control how much leave transfers to the next calendar year.

- **Carry Policy**: 
  - `Lapse`: The system rolls over unused days up to the `Carry Max`. Anything above `Carry Max` is forfeited.
  - `No Carry`: Balances reset to `0` entirely on Jan 1st.
  - `Carry All`: The whole balance rolls over (no max cap).

- **Expiry (Months)**: 
  - If you set this to `3`, carried-forward leaves must be used by the end of March (the 3rd month).
  - Any unused carried-forward leaves will automatically lapse and disappear from the employee's balance on April 1st.

## Understanding Approval Rules
- **Manager Approval**: The employee's direct manager must approve.
- **Prior Approval**: A generic strict approval (often requires HR/Admin).
- **No Approval**: Used for emergency Sick Leave or Bereavement where the employee is just notifying the system.

## Staffing Clashes
If multiple people on a team request leave for the same date, the system triggers a **Staffing Warning**. As an Admin or Manager, you can still approve the leave, but the system forces you to provide an explicit **Override Reason** (e.g. "Cover arranged with a contractor") for the audit trail.
