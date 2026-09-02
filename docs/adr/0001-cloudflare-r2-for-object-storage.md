# ADR-0001: Cloudflare R2 for object storage

**Date**: 2026-09-02
**Status**: accepted
**Deciders**: SrjAdhikari (project owner)

## Context

User files stream to the server's local disk today — paths are built against `STORAGE_ROOT` in `src/utils/storagePath.js` and served back through Express with `res.sendFile` / `res.download`. Local disk does not survive a redeploy, cannot scale past a single host, and offers no durability guarantee.

TroveCloud's cost profile is egress-dominant (users upload once and download or preview repeatedly) and delete-heavy (users manage their own files against a per-user quota). Provider cost is therefore driven by egress rates and retention policy, not by the headline per-GB storage price.

## Decision

Use Cloudflare R2 as the object store for user files and profile pictures, accessed through its S3-compatible API so the provider stays swappable.

## Alternatives Considered

### AWS S3

- **Pros**: reference S3 implementation, deepest tooling and ecosystem, 100 GB/month free egress.
- **Cons**: $0.09/GB egress beyond the free allowance; $0.023/GB storage.
- **Why not**: at 500 GB stored / 1 TB egress it costs roughly $99/month against R2's $7, and the gap widens with traffic.

### Backblaze B2

- **Pros**: cheapest storage at $6.95/TB; egress free up to 3x stored volume, and unlimited when fronted by Cloudflare CDN.
- **Cons**: the free-egress allowance is a policy ceiling rather than a guarantee; requires a second vendor plus a correctly wired CDN to keep egress free.
- **Why not**: saves about $4/month at our scale — not enough to justify a second vendor and a policy we do not control.

### IDrive e2

- **Pros**: $6/TB storage, free API requests, same 3x egress allowance.
- **Cons**: $6/month floor regardless of usage; smaller operator; same policy ceiling as B2 without B2's CDN escape hatch.
- **Why not**: costs more than R2 during the early phase and carries the egress-policy risk anyway.

### Wasabi

- **Pros**: flat $7.99/TB with no request or egress charges.
- **Cons**: 90-day minimum retention, 1 TB monthly minimum, egress capped at 1x stored volume.
- **Why not**: disqualifying for this workload. Deleted files keep billing for 90 days, and a file-sharing product routinely serves more bytes than it stores.

### Hetzner, DigitalOcean Spaces, Scaleway, Storj, Tigris, Bunny

- **Pros**: bundled storage/traffic quotas, EU data residency, or zero-egress pricing depending on the provider.
- **Cons**: monthly floors, metered egress, or per-GB rates above R2 with no offsetting benefit.
- **Why not**: none is cheaper than R2 at our scale while also being simpler to operate.

## Consequences

### Positive

- Egress is free and uncapped — no allowance to monitor as traffic grows.
- No minimum spend and no minimum retention, so deleting a file stops billing immediately. This matches how per-user quotas behave.
- The free tier (10 GB storage, 1M Class A and 10M Class B operations per month) covers the entire early phase.
- Storage consolidates onto Cloudflare, which already fronts the API — one vendor, one dashboard, one bill.
- Files survive redeploys and the application server becomes stateless.

### Negative

- Storage costs $15/TB against B2's $6.95 — roughly 2x per GB, paid in exchange for the egress guarantee.
- Adds `@aws-sdk/client-s3` as a dependency and a set of R2 credentials to manage.
- Downloads must move to presigned URLs. Proxying bytes through Express would bill egress twice (bucket to server, then server to client) and make the Node process a bandwidth bottleneck. This breaks the existing file and avatar read contracts and requires a matching frontend change. The mechanism is decided in [ADR-0002](./0002-browser-direct-uploads-with-quota-reservation.md).
- Local development needs a real R2 bucket — see [ADR-0002](./0002-browser-direct-uploads-with-quota-reservation.md).

### Risks

- **Request volume drives unexpected cost.** Thumbnails and previews generate many Class B reads. Mitigation: the free tier absorbs 10M reads/month; revisit if usage approaches it.
- **Migrating the existing local files.** Mitigation: every candidate speaks the S3 API, so `rclone` handles both the initial upload and any future provider move. Reversal cost stays low.
- **Presigned URL leakage.** Such a URL grants access to anyone holding it until it expires. Mitigation: short expiry, generated per request rather than persisted on the document.

### Revisit when

Stored data exceeds roughly 5 TB. At that point the R2-versus-B2 storage gap is about $70/month, and B2 behind Cloudflare CDN becomes worth the second vendor.
