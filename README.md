# Intertie implementations registry

The source of the public directory of [Intertie](https://github.com/Hakiwen/intertie)
implementations. Intended home: **https://intertie.dev**, served by GitHub Pages; see
`CNAME`.

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

## Domain setup (one-time, for whoever holds intertie.dev)

1. In **Settings → Pages**:
   - set Source to "GitHub Actions";
   - set the custom domain to `intertie.dev`;
   - tick **Enforce HTTPS**. `.dev` is on the HSTS preload list, so HTTPS is mandatory.
2. At DNS, point the apex at GitHub Pages:
   - `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
     `185.199.111.153`;
   - `AAAA` records: `2606:50c0:8000::153`, `2606:50c0:8001::153`,
     `2606:50c0:8002::153`, `2606:50c0:8003::153`;
   - optionally, `www` as a `CNAME` to `hakiwen.github.io`.
3. Optionally, verify the domain under the account's **Settings → Pages → Verified
   domains**, to prevent takeover.

A Pages site is **public** even when its repository is private (and it needs a paid
plan for a private repository). So the `pages` workflow runs manually only until
launch. To go live, enable Pages and add `push: branches: [main]` to
`.github/workflows/pages.yml`.

## License

Apache-2.0.
