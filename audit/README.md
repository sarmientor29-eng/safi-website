# SAFI — Read-only audit and isolated development

Source repository: sarmientor29-eng/safi-website
Baseline: 92c8712ec5add0b6bd7f82e966db1bb77c01e0f9
Development branch: dev/safi-audit-finance-core

## Scope and safeguards
- No production deployment, Firebase writes, emails, or live customer data.
- Existing HTML, CSS, JavaScript, and root files are untouched.
- This branch introduces only isolated finance utilities and tests.
- Do not use this module for tax filing or real invoicing without validating Canadian GST treatment, permissions, numbering, and audit trails.

## Verified source inventory
- Public: index.html, services.html, projects.html, gallery.html, contact.html, apply.html.
- Access: login.html, signup.html, assets/js/auth.js, assets/js/firebase-config.js.
- Roles: dashboard-client.html, dashboard-worker.html, admin-dashboard.html.
- Work: flha.html, admin-flhas.html, timesheets.html, admin-timesheets.html, worker-timesheet-form.html.
- Sales: quote.html, invoice.html, admin-quotes-invoice.html, assets/js/sales-ui.js.
- Styling: styles.css; images: imagenes/.

## Confirmed findings
1. invoice.html uses a user-editable invoice number and addDoc(invoices). Transactional uniqueness not verified.
2. admin-quotes-invoice.html uses deleteDoc on quotes/invoices. Recommend voiding and audit records instead.
3. auth.js checks role on client. Server-side Firestore/Storage rules remain unverified.
4. quote.html and invoice.html duplicate calculations and PDF presentation.
5. contact.html and apply.html submit to Formspree; apply.html also links Google Forms.
6. Nested project coexists with older root index.html/styles.css, creating deployment ambiguity.
7. Historical commit a984678 contains site_cms with Netlify CMS and JSON-managed services/projects/workers. Reuse ideas, not blindly the old stack.
8. No test suite or package manifest observed in inspected nested directory.

## Low-risk implementation delivered
finance-core.mjs: pure integer-cent arithmetic, explicit tax-rate input, discount and partial-payment balance. It never accesses Firestore. No live page imports it yet.
finance-core.test.mjs: Node built-in test runner.

Run: node --test audit/finance-core.test.mjs

## Next engineering tasks
1. Verify Firebase Firestore rules and backups through authorized read-only console access.
2. Create isolated fixture-based integration tests for current quote/invoice UI.
3. Design server-side invoice numbering and immutable audit history.
4. Introduce staged migration with rollback; preserve existing documents.
5. Validate tax calculation, invoice legal fields and GST treatment with Canadian accountant.
