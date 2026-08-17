# Hidden achievement identifiers are private until unlock

## Decision

A locked hidden achievement is projected as only `{ "hidden": true, "locked": true }`.
Its slug is content, not a public identifier: API responses, rendered HTML, analytics,
logs, and client-side keys must not expose it before the trusted unlock is committed.

After unlock, the normal achievement projection may include the slug, localized title,
description, progress, target, unlock time, and earned collection key. No stable hidden
identifier is currently required by the UI. If one becomes necessary, it must be an
opaque account-scoped value rather than the catalog slug.

## Rationale

Hidden slugs can disclose story outcomes, safety paths, or the condition itself even
when titles and descriptions are suppressed. A generic placeholder preserves the
locked-card experience without publishing that information through the JSON endpoint.

## Verification

Domain, service-state, JSON-route, and rendered-DOM tests assert that locked hidden
catalog values are absent and that the ordinary projection returns after unlock.
