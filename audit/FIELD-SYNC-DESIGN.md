# SAFI field uploads — staging contract (not deployed)

The browser-only worker drafts and the admin review demo are **not connected**. The code in `field-upload-contract.mjs` validates an illustrative request shape and defines retry/idempotency behavior; it is **not a server endpoint**, authorization layer, or file scanner.

## Proposed production flow

1. Worker authenticates. Server derives `workerId` from a verified session/token, **never trusts a client-supplied identity**.
2. Server verifies the worker's authorization for `projectId`. Enforce rate limits, size limits and content validation; inspect actual file bytes, not only MIME metadata. Store photos in private object storage with scoped access.
3. Client creates a stable random submission ID before first upload. Server atomically checks uniqueness scoped to worker and project. Same key + identical payload returns the **original** receipt; same key + different payload returns conflict. Compare immutable photo checksums as well as metadata.
4. Upload bytes through authenticated, time-limited upload URLs or an authenticated API. Validate all photo uploads are complete before committing the submission. Use a transaction and an outbox for eventual processing.
5. Server returns a signed/unguessable receipt ID only **after durable persistence**. Client changes `pending` to `received` only after server acknowledgement; never infer success from network reconnection.
6. Failed/unconfirmed uploads retry with capped exponential backoff and jitter. A timeout after a successful server commit must be safe to retry with the same idempotency key.
7. Only authorized admins can approve or reject received records. Record reviewer, timestamps, reason, audit trail and immutable original files.
8. Store drafts encrypted where feasible; require session protection and minimize sensitive data retained on shared phones. Show explicit sync state, offline warnings and deletion/retention controls.
9. Test airplane mode, poor reception, browser termination, device storage pressure, duplicate submissions, lost acknowledgements, photo upload failure, authentication expiry and multiple worker accounts.
10. Keep Firebase, existing public site and `main` unchanged until end-to-end testing and approval.

## Limitations of current prototype

- The mobile offline page uses IndexedDB locally only and **does not synchronize**.
- The review page uses hard-coded fictional entries; “Simulate receipt” does not upload anything.
- The pure contract validates metadata only; no real authentication, persistence, image scanning, network retry scheduler or receipt issuance is implemented.
- The demo worker ID and project IDs are placeholders; they are not real assignments.
