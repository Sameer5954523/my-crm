# CRM Workflow Update

## Fronting
- Submitted leads are locked server-side for fronters immediately after creation.
- Fronters cannot edit lead details, notes, bookings, or dispositions after submission.
- Fronters retain ownership of their submitted leads after closer/chase handoff.
- Fronter dashboard shows total submitted leads, closer-completed/handoff count, completion ratio, and a compact breakdown of closer dispositions.

## Closer
- Closers see two clearly separated queues in the lead table:
  - My Closer Leads — disposition controls enabled.
  - Other Closer Leads — view-only.
- Only the assigned closer can change closer-stage dispositions.
- Admin and Super Admin can reassign an active appointment/lead to any closer.
- Server-side validation prevents a closer from bypassing the closer disposition workflow through the edit endpoint.

## Chase workflow
1. Closer selects `Customer Form Completed` OR the closer completes the appointment.
2. Lead is automatically routed to the least-loaded chase agent when available.
3. A 24-hour physical-form SLA starts immediately.
4. Chase selects `Customer Form Sent`.
5. A 7-day customer-return SLA starts immediately.
6. Chase selects `Customer Form Received`.
7. The active SLA timer clears.
8. Overdue chase tasks show red `OVERDUE` timers and a persistent chase alert.
9. Chase agents can only update leads assigned to them.

## AI / Reporting
- `/api/ai/chase-report` provides operational intelligence without requiring an external AI API key.
- Includes live queue counts, overdue risk, 24-hour SLA rate, average send time, average return time, return rate, workload score, SLA health, expected returns in the next 7 days, risk leads, recommendations, and agent performance.
- Fronter analytics includes a closer-disposition breakdown.

## UI
- Refreshed responsive glass/gradient visual system for light and dark mode.
- Sticky desktop navigation, mobile-friendly controls, improved KPI cards, AI visual treatment, SLA emphasis, and responsive queue presentation.
- Timers update live so 24-hour and 7-day countdowns remain current.


## VISION CRM Frontend Refresh
- Replaced the previous basic navigation presentation with a responsive operations shell.
- Added fixed desktop navigation with role-aware Workspace, Appointments, Intelligence and Team & Access modules.
- Added live role greeting, session status, avatar and secure sign-out control.
- Added a role-aware KPI strip for pipeline, completion, SLA attention and completion ratio.
- Added dedicated visual hierarchy for Fronter, Closer and Chase workflows.
- Added responsive desktop/tablet/mobile breakpoints and stronger light/dark visual tokens.
- Added professional queue/table, SLA, AI and management surfaces without removing the existing CRM functions.
- Added `npm start` support; dependency installation remains `npm.cmd install` on PowerShell systems that block npm.ps1.
