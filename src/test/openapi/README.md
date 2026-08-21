# OpenAPI snapshot

`openapi.json` is the zm_api contract the dashboard is built and tested
against. `src/api/contract.test.ts` and `src/test/fixtures/fixtures.schema.test.ts`
read it, so it is **tracked** — the previous copy lived under the gitignored
`legacy-requirements/`, which meant those tests could not run in CI.

Refresh it when the backend changes:

```sh
curl -s http://<zm_api-host>/api-docs/openapi.json -o src/test/openapi/openapi.json
npm test          # contract + fixture tests tell you what drifted
```

Captured 2026-08-22 from the dev box (zm_api 3.0.0-alpha.1, 152 paths,
ZoneMinder 1.39.16).
