---
name: Raw-imported repl artifact registration
description: What to do when a repl has full artifact.toml files under artifacts/* but listArtifacts()/listWorkflows() return empty and .replit has no workflow entries.
---

A repl imported from an external source (e.g. a zip/git import) can contain fully-formed `artifacts/*/.replit-artifact/artifact.toml` files and source code, yet the platform hasn't registered them: `listArtifacts()` and `listWorkflows()` return empty, `.replit` has zero workflow entries.

**Do not immediately reach for the `migrate-to-multi-artifact` skill's heavy port-existing-app flow.** Give the platform a chance first — it can auto-detect and register the artifacts/workflows on its own shortly after the environment settles (observed via `automatic_updates` messages listing the newly-created artifacts and matching workflows).

**How to apply:** After confirming the raw-import symptom, do routine setup work (`pnpm install`, fix obvious build errors) and check again for auto-registration before committing to a manual migration. If registration doesn't happen after reasonable setup work, fall back to the migration skill.
