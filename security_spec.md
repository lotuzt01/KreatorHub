# Karsa Digital — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Any path outside explicitly matched collections (`/products`, `/publicSettings`, `/adminSettings`, `/orders`, `/orderStatuses`, `/telegramLogs`, `/admins`, `/mediaAssets`) MUST be denied for all operations.
2. **PII Isolation (Split Collection)**: Customer PII (`customerName`, `customerEmail`, `customerPhone`, `buyerSecret`) resides exclusively in `/orders/{orderId}` which is NEVER readable by non-admin clients (`get` and `list` require Admin). Buyers observe live payment instructions and verification status via the PII-free `/orderStatuses/{orderId}` document by exact ID (`list` is forbidden to non-admins).
3. **Admin Authentication & Email Verification**: The bootstrapped admin (`nomigosone@gmail.com`) MUST have `request.auth.token.email_verified == true`. Unverified emails or arbitrary signed-in users are strictly rejected.
4. **No Self-Assigned Admin Roles**: Non-admin users cannot create or modify `/admins/{uid}` documents.
5. **Atomicity Guarantee**: Creating an order in `/orders/{orderId}` MUST atomically create its matching `/orderStatuses/{orderId}` document in the same batch (`existsAfter`), and vice versa.
6. **No Payment Forgery (State Shortcutting)**: Non-admin clients can NEVER create an order with `status: 'PAID'` or `downloadReady: true`, and can NEVER update an order or status to `PAID` or `downloadReady: true`.
7. **Terminal State Locking**: Once an order reaches `PAID` or `CANCELLED`, non-admin clients can NEVER modify it again.
8. **Temporal Integrity & Immutability**: `createdAt` must equal `request.time` on create and remain immutable on update. `updatedAt` must equal `request.time` on every write.
9. **Path ID & Size Hardening**: Every document ID must match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and every string/list field has explicit `.size()` upper bounds to prevent Denial-of-Wallet attacks.
10. **MediaAsset Safety & Anti-XSS Protocol Guard**: `/mediaAssets/{assetId}` allows public `get` by exact valid ID (zero PII), restricts `list`, `create`, `update`, and `delete` strictly to Admin, caps compressed upload data URLs at `<= 280000` chars (`image/jpeg`, `image/webp`, or `image/png` base64 only — blocking `image/svg+xml`, `text/html`, and `javascript:`), and restricts URL assets to `https://` (`<= 500` chars).
11. **Private Product Download Links (`/productLinks/{productId}`)**: Paid app/file download URLs are stored strictly in `/productLinks/{productId}` (Admin-only `get`, `list`, `create`, `update`, `delete`) and NEVER exposed publicly in `/products/{productId}`. Download URLs are delivered to `/orderStatuses/{orderId}.downloadLinks` exclusively by Admin when verifying an order as `PAID`.

## 2. The "Dirty Dozen" Attack Payloads (All MUST Return PERMISSION_DENIED)
1. **Shadow Field Injection on Product Create (Admin)**: Admin creates `/products/prod-evil` with an extra ghost field `isSuperAdmin: true`.
2. **Unverified Admin Email Spoof**: User with `email: 'nomigosone@gmail.com'` and `email_verified: false` attempts to read `/orders/ord-1` or write `/products/prod-1`.
3. **Self-Assigned Admin Escalation**: Regular signed-in user attempts to create `/admins/{theirUid}` with `role: 'admin'`.
4. **PII Blanket Read Attack**: Non-admin signed-in user attempts `get` or `list` on `/orders/ord-1` to harvest buyer emails and phone numbers.
5. **OrderStatus Enumeration (List Scraping)**: Non-admin user attempts `list` on `/orderStatuses` to scrape all active invoices.
6. **Payment Forgery on Create (State Shortcutting)**: Buyer attempts to create `/orders/ord-fake` with `status: 'PAID'` to bypass payment verification.
7. **Buyer Payment Forgery on Update**: Buyer holding valid `buyerSecret` attempts to update `/orders/ord-1` to `status: 'PAID'` or `/orderStatuses/ord-1` with `downloadReady: true`.
8. **Buyer Secret Spoofing**: Attacker without matching `buyerSecret` attempts to update `/orders/ord-1` to `status: 'PAYMENT_SUBMITTED'`.
9. **Terminal State Tampering**: Buyer attempts to modify an order whose `status` is already `PAID` or `CANCELLED`.
10. **Orphaned Order Create (Atomicity Violation)**: Buyer creates `/orders/ord-orphan` without atomically creating `/orderStatuses/ord-orphan` in the same batch.
11. **Timestamp Forgery & Immutable Field Tampering**: Client submits a backdated `createdAt` timestamp instead of `request.time`, or attempts to alter `createdAt` during an update.
12. **Denial-of-Wallet & Media XSS Poisoning**: Client submits a document ID `> 128` chars, a 10KB `transferProofNote`, a non-admin write/list on `/mediaAssets`, or an SVG/HTML payload (`data:image/svg+xml;base64,...`) into `/mediaAssets/asset-xss`.
