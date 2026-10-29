# Intertie implementations registry

The source of **https://intertie.dev**: the public directory of Intertie
implementations, served by GitHub Pages from this repository.

Intertie is an open protocol for shared channels between organizations, with no
intermediary. Its specification, reference implementation and conformance runner live
in a separate repository that is **not public yet**. This directory will link to it
once it is.

- **A directory, not a service.** This site is static. It holds no keys or tokens,
  and no message between organizations passes through it.
- **Self-certification.** Each entry points to a conformance report that the
  implementer produced with `intertie-conformance` and signed with their own org key.
  CI checks the following on every pull request:
  - the entry schema;
  - that the report passed;
  - that the levels and roles in the entry are claimed by the report;
  - the report's signature, against the key published at
    `https://<org>/.well-known/intertie`.
  The maintainer merges.
- **Later, optionally:** a hosted verifier, modelled on an ACME CA, that re-runs the
  suite against an endpoint and countersigns the result. It would be opt-in and would
  never sit in any message path.

| File | What |
|---|---|
| `implementations.json` | The list, one object per implementation (`schema/implementation.schema.json`) |
| `reports/<slug>.json` | The signed conformance reports |
| `index.html` | The page, which renders `implementations.json` in the browser |
| `scripts/validate.mjs` | The CI validator. Zero dependencies: `node scripts/validate.mjs` |
| `.github/workflows/` | `validate` on pull requests, `pages` deploys `main` |

## Hosting

- `main` deploys to GitHub Pages on every push, through `.github/workflows/pages.yml`.
- The custom domain is `intertie.dev` (see `CNAME`), with HTTPS enforced. `.dev` is on
  the HSTS preload list.
- DNS: the apex has `A` and `AAAA` records to GitHub Pages, and `www` is a `CNAME` to
  `hakiwen.github.io`.

## License

Apache-2.0.
