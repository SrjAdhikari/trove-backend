# Architecture Decision Records

Each ADR records one architectural decision: the forces that prompted it, the option chosen, the alternatives rejected, and the trade-offs accepted. They capture the **why**; `.claude/STACK.md` captures the current **what**.

Add a new one by copying [`template.md`](./template.md) and taking the next number.

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](./0001-cloudflare-r2-for-object-storage.md) | Cloudflare R2 for object storage | accepted | 2026-09-02 |
| [0002](./0002-browser-direct-uploads-with-quota-reservation.md) | Browser-direct uploads with server-side quota reservation | accepted | 2026-09-02 |

## Status lifecycle

`proposed` → `accepted` → `deprecated` or `superseded by ADR-NNNN`

A superseded ADR stays in place and links to its replacement — the history is the point.
