# Security policy

## Reporting a vulnerability

If you've found a security issue in Spectra — credential leakage,
denial-of-service via specific catalog shapes, validation bypass, or
anything else that could harm a downstream user — please report it
privately.

Email: rachelallyson@users.noreply.github.com (or via the
[GitHub private vulnerability reporting](https://github.com/rachelallyson/spectra/security/advisories/new)
flow).

We aim to acknowledge reports within 72 hours and publish a fix
within 14 days for confirmed issues. If you don't hear back within a
week, please ping again — we'd rather hear about it twice than miss it.

## Threat model — what Spectra does and doesn't protect against

Spectra is a **producer** of structured telemetry. It validates
payloads against schemas you define and forwards events to publishers
you configure. It does *not*:

- Encrypt data in transit. That's the publisher's job (use HTTPS, pin
  your transport).
- Sanitize input by default. Schemas validate shape; payloads still
  contain whatever you put in them. Use `redactingPublisher` (or
  redact at the call site) for PII.
- Authenticate publishers to upstreams. Auth tokens belong in the
  publisher you write.

## Best practices

- **Run with `validate: 'strict'` in production.** It's the default
  and the cheapest defense against payload-shape regressions reaching
  downstream consumers.
- **Pair `redactingPublisher` with vendor adapters that ship to
  third parties.** Any adapter that POSTs over the network should
  scrub PII first; the order is `redactingPublisher(['paths'],
  vendor)`.
- **Don't put secrets in event payloads.** Payloads are observable by
  every publisher. If you can't afford it in your logs, don't emit it.
- **Use `setErrorSink` for the error pathway.** Errors travel through
  a separate channel (`captureError`); make sure it's wired to your
  exception tracker, not to the same publishers as `emit()`.

## Supported versions

The latest minor on `latest` gets security fixes. Older minors are
best-effort during the pre-1.0 period — when in doubt, upgrade.
