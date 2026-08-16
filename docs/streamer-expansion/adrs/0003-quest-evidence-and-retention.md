# ADR 0003: Bound quest evidence and retain immutable review facts

- Status: Accepted
- Date: 2026-08-16
- Phase: 0

## Context

Some safe creative or practice quests cannot be verified by a game engine. They may require a short response, checklist, screenshot, or owner confirmation. Arbitrary file hosting would create malware, decompression, privacy, moderation, storage, and retention risks. Deleting all evidence immediately would weaken dispute handling and reward audits, while retaining raw uploads forever would exceed product need.

The repository already validates dictation PNG signatures, dimensions, CRCs, and normalized bytes. That narrow pattern is preferable to a general attachment system.

## Decision

Quest definitions declare an allowlisted evidence policy. Supported evidence types are:

- normalized PNG screenshot;
- bounded plain-text response;
- structured checklist with registered keys;
- owner or administrator confirmation;
- reference to a verified product event.

Screenshot ingestion reuses the existing PNG security approach and additionally enforces quest-specific byte, pixel, dimension, and count limits. It rejects SVG, HTML, executable formats, polyglots, malformed PNGs, decompression bombs, animation, and unnecessary metadata. The stored artifact is the server-normalized image, not the original upload.

Evidence records store media type, byte count, dimensions where applicable, cryptographic hash, uploader, assignment and step ownership, creation time, retention deadline, and immutable provenance. Public responses never expose filesystem paths or storage credentials. Text is bounded plain text and always escaped when rendered.

Review decisions are append-only events. They record reviewer, outcome, bounded reason code, optional bounded note, timestamp, correlation ID, and the exact evidence hash reviewed. Returning a submission creates a new review event and preserves prior decisions. Approval emits a trusted quest event; it does not directly credit points outside quest settlement.

Raw normalized screenshots and user-authored text follow the streamer's configured retention preference within legal, security, and audit minimums. On expiry, content bytes may be deleted or irreversibly detached, while a minimal tombstone remains with hash, type, size, timestamps, review decisions, settlement reference, and deletion reason. Financial, provider, administrative, and reward-settlement records are never cascade-deleted with evidence content.

Quest content must never require private messages, identity documents, credentials, exact location, health data, financial details, or proof from private off-platform accounts. Reporting and moderation holds may pause normal deletion under an explicit audited policy.

## Consequences

- Evidence storage needs quota enforcement, retention jobs under `ApplicationLifecycle`, and export/deletion projections.
- Tests must cover signature spoofing, malformed CRC, oversized dimensions, polyglots, duplicate uploads, XSS text, ownership, review races, retention expiry, and audit preservation.
- Review interfaces show only product-relevant evidence and never raw storage locations.
- Evidence policy is part of an immutable published quest version.

## Rejected alternatives

- Accepting arbitrary MIME types was rejected because content-type headers are not a security boundary.
- Permanent retention of all raw evidence was rejected as unnecessary and privacy-hostile.
- Immediate hard deletion of all records was rejected because it would break review, appeal, and value-settlement auditability.
