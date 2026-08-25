# Backend documentation index

> Most files in this directory describe retired Pathfinder, Map, Insights,
> Story, Stream or Living Tree systems. They are implementation history, not
> current Almanac product direction.

Start with the workspace authority index:
[`../../docs/current/README.md`](../../docs/current/README.md).

## Current backend authority

| Source | Use for |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Backend working rules and current product boundary |
| [`../README.md`](../README.md) | Active API surface and repository role |
| [`../DEPLOY.md`](../DEPLOY.md) | Deployment operations |
| [`../prisma/schema.prisma`](../prisma/schema.prisma) | Implemented database schema |
| [`../src/lib/almanac/`](../src/lib/almanac/) | Persisted Almanac service behaviour |
| [`../../docs/current/ALMANAC-NATIVE-DOGFOOD-STATUS.md`](../../docs/current/ALMANAC-NATIVE-DOGFOOD-STATUS.md) | Verified build and deployment status |

## Historical compatibility material

The remaining documents are useful only for tracing or maintaining legacy code.
Names such as Goal, Chapter, Theme, Map, Insights, Story, Reflect and Living Tree
must not be treated as requirements for the current Subject History product.

Repository history remains in [`../CHANGELOG.md`](../CHANGELOG.md) and
[`../DECISIONS.md`](../DECISIONS.md), but dated decisions do not override the
workspace current canon.
