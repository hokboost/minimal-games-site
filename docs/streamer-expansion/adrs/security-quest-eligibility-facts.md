# Quest eligibility uses complete server-owned facts

Status: accepted (2026-08-17)

Quest eligibility is a closed rule subset: `all`, `any`, `not`,
`relationship_level`, `has_achievement`, `story_flag`, and
`owns_collection_item`. Completion events, review state, time windows, and
browser-provided facts are not valid eligibility operands. A rule may reference
at most 128 fact leaves.

Before an offer is written, the service locks the creator account, derives the
exact referenced fact keys from the immutable version rule, and loads only
those keys from authoritative tables:

- achievement unlocks come from `streamer_achievement_unlocks` joined to the
  immutable definition slug;
- story flags come from current projections of non-replay `active` or
  `completed` runs; abandoned branches never qualify;
- collection ownership comes only from `streamer_collection_holdings`;
- relationship level comes from the locked relationship profile.

Multiple authoritative story projections may repeat the same value, but
conflicting values for one requested key fail closed. Studio draft creation and
publication both revalidate the same closed eligibility grammar and reference
budget. This prevents a missing runtime projection—especially below `not`—from
silently granting an assignment.

The fact reads and offer insert share one database transaction and the user
row is locked first, matching achievement, story, and collection producer lock
ordering. No secondary mutable eligibility cache is introduced.
