# WP-M4-05 Legacy Backfill

The legacy importer uses an explicit catalog for four packages:

- `episode-001-v1` → `content/episode-001`
- `episode-001-v2-goal3` → `content/episode-001/v2-goal3` (alias: `content/episode-001-v2-goal3`)
- `episode-002-v1` → `content/episode-002`
- `episode-002-v2-goal3` → `content/episode-002/v2-goal3` (alias: `content/episode-002-v2-goal3`)

v1 discovery explicitly excludes its nested v2 package. Workflow-referenced v1 delivery files under
`output/<episode>/` are included explicitly. Enumeration is sorted and fail-closed for missing
packages, workflow files, broken links, cross-package references, unsupported filesystem entries, and
hash mismatches.

`importLegacyPackage` returns a reference-only `ArtifactIndex`, canonical `ArtifactRef`s, package
provenance, and canonical observability events. `importLegacyPackages` imports all four catalog
entries in catalog order. Both APIs are read-only: they do not write the source package, registry,
workflow, approval, or final-state files. Repeated imports use deterministic IDs, hashes, revision 1,
and the unavailable legacy timestamp unless a fixed `occurredAt` is supplied.

For v2 packages, the flat-ID symlink is a locator only. Registry paths and artifact identities always
use the nested canonical path, so canonical and alias selection produce one identity. Existing
non-legacy registry records that collide by identity or canonical path cause a fail-closed error.
