# `@wp-typia/api-client`

## 0.5.0 — 2026-07-28

### Minor changes

- [fcbb14b0](https://github.com/imjlk/wp-typia/commit/fcbb14b01c68faf1c9e1b7144f356ff93fbb1897) Move the supported development and generated-project toolchain to Node.js 24,
  TypeScript 7, typia 13, and ttsc. Generated projects now declare Node.js 24
  or newer. — Thanks @imjlk!

## 0.4.6 — 2026-06-02

### Patch changes

- [25c7d51c](https://github.com/imjlk/wp-typia/commit/25c7d51c5ee424d7fa6dfee8b951d434719804d7) Enable the next package-level TypeScript strictness ratchet for the smaller runtime packages. — Thanks @imjlk!

## 0.4.5 — 2026-04-18

### Patch changes

- [5b71cdc](https://github.com/imjlk/wp-typia/commit/5b71cdced704a0b1f2dcb030c4cf7a8c2c74481f) Refresh the hosted docs site, expand TypeDoc and TSDoc coverage for core plus advanced public surfaces, and document the latest public facade boundaries without changing runtime behavior. — Thanks @imjlk!

## 0.4.4 — 2026-04-13

### Patch changes

- [663872b](https://github.com/imjlk/wp-typia/commit/663872b51f25f5ddccec3cafb776450abfeca7f9) Clarify the public runtime error contract and `@wp-typia/rest` export semantics
  by documenting validation-vs-throw behavior, introducing named configuration and
  assertion errors for the runtime client packages, and explicitly documenting
  that `./client` and `./http` remain compatibility aliases in the current major
  line instead of introducing a breaking export split. — Thanks @imjlk!

## 0.4.3 — 2026-04-12

### Patch changes

- [e962f79](https://github.com/imjlk/wp-typia/commit/e962f7932927998191a8fcae2a41dd2f69447cff) Fix request validation failure paths so `callEndpoint()` and the React REST
  helpers preserve an honest request-vs-response validation contract instead of
  casting request failures to response validation results. — Thanks @imjlk!

## 0.4.2 — 2026-04-09

### Minor changes

- [9f9e6dd](https://github.com/imjlk/wp-typia/commit/9f9e6ddb0bdd041a678ecce381ff82db8a0123e8) Consolidate the shared validation/object/form-data runtime helpers used by

### Patch changes

- [ab7d1c9](https://github.com/imjlk/wp-typia/commit/ab7d1c9afaf4039b5053991ca9fe88cabcd46a13) Publish shared API client utilities and runtime primitives from `@wp-typia/api-client`, reuse them across rest and runtime packages, and align active package Bun minimums with `1.3.11`. — Thanks @imjlk!

## 0.3.0 — 2026-04-05

### Minor changes

- [56d9906](https://github.com/imjlk/wp-typia/commit/56d9906401db82940cb1bb9b2840da0dcac694d4) Separate backend-neutral endpoint auth intent from WordPress-specific auth
  mechanisms in endpoint manifests, generated OpenAPI metadata, and portable API
  client endpoint metadata while preserving legacy `authMode` compatibility. — Thanks @imjlk!

## 0.2.0 — 2026-04-05

### Minor changes

- [faef0a6](https://github.com/imjlk/wp-typia/commit/faef0a66b974956373a42be8324db37c4be3f97f) Add first-class mixed `{ query, body }` request support to generated portable
  endpoint clients so `syncEndpointClient(...)` and `@wp-typia/api-client` can
  handle endpoints that define both `queryContract` and `bodyContract`. — Thanks @imjlk!
- [ec0c3fb](https://github.com/imjlk/wp-typia/commit/ec0c3fb82abfa11be512f999e1acbd91d466cff1) Add a new transport-neutral `@wp-typia/api-client` package and manifest-first
  `syncEndpointClient(...)` generation in `@wp-typia/create/metadata-core` so
  persistence-style contracts can emit portable `api-client.ts` modules alongside
  their existing WordPress-specific `api.ts` and aggregate OpenAPI artifacts. — Thanks @imjlk!
- [a6cfe68](https://github.com/imjlk/wp-typia/commit/a6cfe68388dc20f65fd2ea71189514a9a3a4d6eb) Add optional transport decorator helpers such as `withHeaders(...)`,
  `withComputedHeaders(...)`, `withHeaderValue(...)`, and `withBearerToken(...)`
  so portable API clients can attach common header and auth behavior without
  rewriting custom transport wrappers. — Thanks @imjlk!

