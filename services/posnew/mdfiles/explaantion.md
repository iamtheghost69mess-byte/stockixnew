# Complete Business Workflow Explanation

This platform has two layers:
- **Restaurant layer (tenant layer):** day-to-day operations like tables, orders, payments, printing, inventory, staff.
- **Platform layer (SaaS owner layer):** creating businesses, setting limits/plans, subscription lifecycle, support, and governance.

Think of it as **one software platform serving many businesses**, where each business can run one or many branches.

---

## 1) Tenant & Location Structure

### What is created when a new business signs up
When a new business is onboarded, the system creates:
- A business account (the tenant).
- A default main branch/location.
- Initial operational setup (starter roles, baseline settings, and default operational data).

So onboarding is not just a name in a list; it bootstraps a working business environment.

### Can one business have multiple branches
Yes. A single business can have multiple locations/branches under the same tenant.

### How locations relate under one business
Locations are siblings under one parent business:
- Same business identity and subscription.
- Shared business-level governance and limits.
- Operational data can be filtered by location.

### Is data shared or separate between locations
Both, depending on data type:
- **Shared at business level:** many master settings and catalogs.
- **Separated by branch in operations:** tables, active orders, stock balances, branch activity.

So it is not “fully isolated per branch” and not “fully global” either; it is mixed by design.

### Is the system user-scoped, location-scoped, or both
Both together:
- **User scope:** who you are and what role/permissions you have.
- **Location scope:** which branch you are currently acting in.

Every major action is evaluated through those two filters.

### If logged in at Location A, can you see Location B
Usually no for branch staff.  
Only users with higher authority and broad branch access can view across branches.  
This is enforced through role permissions + location scoping rules on data retrieval and mutations.

---

## 2) User & Staff Structure

### Are staff tied to one location
A staff member can be:
- Hard-assigned to one location (always scoped there), or
- Not hard-assigned, then branch scope is selected during use (for broader roles).

So location assignment is optional at the user record level, but location scope still matters operationally.

### Waiter vs manager vs admin
At business level:
- **Waiter:** floor operations for own service flow (take/edit orders, table handling within allowed scope).
- **Manager:** broader branch operations, supervision, and more cross-order visibility.
- **Admin:** strongest tenant-side operational authority, including broader management controls.

Permissions are explicit and granular, not just title labels.

### Can same person log in at different locations
Yes if their assignment and permissions allow it.  
If they are fixed to one branch, they remain bound there.  
If they are cross-branch capable, they can operate by selecting/using different location scope.

### Platform-level user vs tenant-level user
They are different universes:
- **Platform-level user:** runs the SaaS business itself (creates tenants, billing, limits, compliance, support).
- **Tenant-level user:** works inside a specific restaurant business (staff and managers).

Platform users manage tenants. Tenant users run restaurant operations.

### User-to-location relationship conceptually
It is effectively:
- **One optional primary location per user**, not many direct branch assignments in the same user record.
- Cross-branch behavior comes from permission/scope behavior, not a many-to-many branch mapping.

---

## 3) POS Session Flow (Shift from open to close)

### a) Staff arrives and logs in
Staff authenticates (PIN or credentials), device trust is checked, and session starts with business context.  
Their role and branch scope determine what screens/data they can access.

### b) Customer sits at a table
A table is selected in the active location.  
If no open check exists, a new order/check is created and the table becomes occupied.

### c) Waiter takes order
Step-by-step:
1. Add items to the check.
2. System recalculates totals and validates order integrity.
3. Stock rules are checked (depending on strictness/settings).
4. Order is saved and visible in operational queues.
5. Optional station submission sends category-based tickets to kitchen/bar printers.

### d) Customer asks for bill
The existing check is finalized for payment:
- totals/taxes/discounts/splits are validated,
- payment intent is recorded,
- receipt printing can be triggered.

### e) Bill is paid
On paid transition, automatic side effects happen:
- Order is marked closed/paid.
- Inventory deduction is applied according to business rules.
- Accounting posting hooks are executed.
- Table is released from active occupancy state.

### f) End of shift
Operationally, branch staff should end with:
- no orphan open checks,
- table states normalized,
- print jobs reconciled,
- cash/payment reconciliation handled by role policy.

---

## 4) Table & Order Logic

### How tables are organized
Tables are branch-specific.  
A table belongs to a location.

### Can two waiters access same table
Not in the same way:
- Ownership/visibility for standard waiters is limited by permission scope.
- Higher roles can intervene and manage more broadly.

So concurrency exists, but controlled by role and visibility policy.

### Order lifecycle states
Typical states are:
- pending
- in progress
- ready
- served
- paid
- cancelled

### What happens to table after payment
When the order is terminal (paid/cancelled), the table is freed and no longer tied to an active order.

---

## 5) Menu & Catalog Logic

### Menu shared across branches or per branch
Core catalog is primarily business-level (shared under the tenant), with branch scope influencing operations and visibility contexts.

### Who can change menu and where
Back-office-capable roles (manager/admin-level permissions) can manage categories/items from management interfaces.

### Categories and printers
Each category can be linked to a specific printer/station.  
This mapping is what determines where item tickets go.

### Menu scope by location or organization
Conceptually organization-first, then applied inside location-based operational context.

---

## 6) Printing Logic

### When waiter sends order
Items are grouped by category and routed to their assigned station printers (kitchen/bar logic by category-to-printer mapping).

### Who triggers receipt print
Receipt printing is typically triggered by front-of-house during or after checkout, not always automatically at payment transition.

### How destination printer is chosen
For station tickets: by item category assignment.  
For customer receipt: selected receipt printer in operational flow.

### Printer scope
Printers are tenant-owned but can be branch-specific (or shared within tenant, depending on configuration).

---

## 7) Inventory Logic

### What happens when item is ordered
The system validates fulfillability and then deducts stock based on configured trigger points (on kitchen send, on payment, or both).

### What if stock runs out
If strict oversell protection is active, sale can be blocked when insufficient stock is detected.  
If policies are relaxed, behavior can allow continuation with later reconciliation.

### Stock scope
Operational stock is primarily tracked per location/branch.

### Shared or separate inventory between branches
Separate branch stock positions, with business-level governance and reporting over them.

---

## 8) Multi-location Business Logic

### Are reports separate per branch
Yes, branch-level reporting exists, and broader users can also review business-wide views.

### Can admin see all branches
Yes, if role/permission allows broad visibility.

### Can staff move between branches
Only if their assignment/scope rules allow it.  
Many staff are practically branch-fixed.

### Can manager at Location A see Location B orders
Possible for higher-privilege users when operating with broader scope; ordinary branch-scoped staff are restricted.

---

## 9) SaaS Owner Dashboard (Platform Layer)

### Who uses it
Platform operators and SaaS internal team, not normal restaurant floor staff.

### Is it superadmin or restaurant owner
It is primarily platform superadmin/support/operations territory.

### SaaS dashboard vs restaurant admin controls
- **SaaS dashboard:** tenant lifecycle, plans, limits, subscription/billing governance, platform oversight.
- **Restaurant admin area:** daily operations inside one tenant (menu, staff ops, branch workflows, POS behavior).

### How SaaS owner creates new business
They create a new tenant record, then provisioning pipeline prepares default branch and initial operational baseline.

### Subscription and billing management
Platform controls plans, tracks subscription state, handles webhook-driven lifecycle updates, and enforces tenant entitlements/limits.

### Can SaaS owner see inside tenant data
Platform has oversight capabilities and support-level visibility controls; this is intentionally stronger than tenant staff visibility.

### How plan limits are enforced
Limits are configured at platform level and stored on tenant entitlements.  
Critical actions (like creating users/locations or consuming usage quotas) enforce those caps.

### What happens when subscription expires
Tenant lifecycle can be moved to restricted/suspended states, which blocks normal operations until resolved.

### Is impersonation/support available
Yes, platform support can establish tenant-support sessions for troubleshooting/assistance under controlled permissions.

---

## 10) Location vs User Scope (Core Behavior)

### Does every action require both valid user and location
Always valid user; location depends on operation type:
- Branch operations (orders/tables/stock) require branch context.
- Some broader admin reads can run without a single branch filter.

### What if user has no assigned location
They can operate with selected branch scope (or broad scope, if their role allows it).

### What if request has no location header
- If user is branch-assigned, system uses that assignment.
- If user is not branch-assigned, result may become all-branches-in-tenant for allowed endpoints.

### Can someone be logged in and see all locations
Yes, but only for users with the right permission profile.  
Standard branch staff stay constrained.

### How system decides which location data to show
Decision order is effectively:
1. Authenticated user identity and role.
2. User’s fixed branch assignment (if any).
3. Explicit active branch scope (if provided).
4. Endpoint policy (branch-scoped vs tenant-wide).

### What happens when waiter opens POS
Business-level flow:
1. Session verifies the staff identity and permissions.
2. Branch context is resolved (usually fixed for waiter-like roles).
3. POS loads branch-relevant floor/tables.
4. Catalog and operational queues are loaded under the same tenant+branch context.
5. Realtime updates subscribe to that tenant (and optionally branch) scope.

That is why two people in the same business can see different data at the same time:  
their role permissions and branch scope are not identical.

---

## Final mental model

Use this model for decisions and training:
- **Tenant = restaurant business boundary**
- **Location = operational branch boundary**
- **User role = authority boundary**
- **Action allowed = tenant match + role permission + location scope**

If you keep those 4 boundaries in mind, most system behavior is predictable.

