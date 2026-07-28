# @wp-typia/block-types

## 0.5.0 — 2026-07-28

### Minor changes

- [fcbb14b0](https://github.com/imjlk/wp-typia/commit/fcbb14b01c68faf1c9e1b7144f356ff93fbb1897) Move the supported development and generated-project toolchain to Node.js 24,
  TypeScript 7, typia 13, and ttsc. Generated projects now declare Node.js 24
  or newer. — Thanks @imjlk!

## 0.4.0 — 2026-07-20

### Minor changes

- [b5278399](https://github.com/imjlk/wp-typia/commit/b52783990671e2591dc4a640290579c2ed86c4e1) Mark the WordPress registration facade peers as optional and isolate its runtime and declaration entrypoint so installing the wp-typia CLI no longer downloads or loads the full WordPress editor dependency graph unless a generated project explicitly needs it. Registration-only exports are removed from the package root and `blocks` aggregate; import them from `@wp-typia/block-types/blocks/registration` instead. Retrofit `init` plans now add `@wordpress/blocks` and its WordPress block types directly so later `add variation` workflows retain their build contract. — Thanks @imjlk!

## 0.3.5 — 2026-06-06

### Patch changes

- [df97d9c4](https://github.com/imjlk/wp-typia/commit/df97d9c47a43cd48e459616b7f7a4d52630f190a) Cover block variation metadata and generated variation registrations in
  `doctor --wp-version-check` by deriving floors from the shared WordPress block
  API compatibility matrix. — Thanks @imjlk!

## 0.3.4 — 2026-06-05

### Patch changes

- [054b3153](https://github.com/imjlk/wp-typia/commit/054b31537494eea83bd434627d311e3d744d3274) Add WordPress compatibility metadata for interactivity, splitting, and blockHooks features. — Thanks @imjlk!

## 0.3.3 — 2026-06-02

### Patch changes

- [ab140e2b](https://github.com/imjlk/wp-typia/commit/ab140e2bf6d394331f65a861937c55b3b9d096b6) Migrate the wp-typia CLI runtime from Bunli/OpenTUI to a Node-first Gunshi entrypoint while keeping Bun as the development and build toolchain, and align block registration facade types with current WordPress block declarations. — Thanks @imjlk!

## 0.3.2 — 2026-05-17

### Patch changes

- [719eda98](https://github.com/imjlk/wp-typia/commit/719eda98ad2fac2d3f4600e388b9bf247d149a10) Split block support, variation, and binding internals by responsibility. — Thanks @imjlk!

## 0.3.1 — 2026-05-16

### Patch changes

- [0eeb3580](https://github.com/imjlk/wp-typia/commit/0eeb3580f67c30e76fab321c2fd868dcb980ed6f) Split block binding source PHP and editor registration source generation into a
  focused internal codegen module while preserving the existing bindings facade. — Thanks @imjlk!
- [514b35d1](https://github.com/imjlk/wp-typia/commit/514b35d144aa2f9d5d465a3b8afee83540b97f4d) Make block-types diagnostic output explicit and silent by default. Non-strict
  warnings from Supports, Variations, and Bindings no longer fall back to
  `console.warn`; pass `onDiagnostic` for structured callbacks or `logger:
  console`/a custom logger for visible warning output. — Thanks @imjlk!
- [7378df6b](https://github.com/imjlk/wp-typia/commit/7378df6b11661385a3c2e3afd734db8fb185378b) Share static registration normalization, object-record checks, and diagnostic
  fallback helpers across block bindings, variations, and supports internals. — Thanks @imjlk!

## 0.3.0 — 2026-05-15

### Minor changes

- [fe793744](https://github.com/imjlk/wp-typia/commit/fe793744e01c4251b229ba19dd24662cb8317b3d) Add a shared WordPress block API compatibility matrix for Supports, Variations, and Bindings, plus project config fields for minimum WordPress version and strict compatibility diagnostics. — Thanks @imjlk!
- [256423d6](https://github.com/imjlk/wp-typia/commit/256423d665da8ab8ded84e22007e34f6bbf06997) Add typed defineVariation() and defineVariations() helpers with validation diagnostics and static JavaScript registration source generation. — Thanks @imjlk!
- [8a47bfc5](https://github.com/imjlk/wp-typia/commit/8a47bfc5e95cf42a42e1fc5765061b6139b832d3) Add defineSupports() and SupportAttributes helpers for typed WordPress Block Supports authoring with version-aware compatibility diagnostics. — Thanks @imjlk!
- [b8ed6ffd](https://github.com/imjlk/wp-typia/commit/b8ed6ffdc4ace09705d328897400eb513e629acb) Add typed defineBindingSource() helpers with Block Bindings metadata types, version-gated diagnostics, and PHP/editor registration source generation. — Thanks @imjlk!

## 0.2.4 — 2026-04-16

### Patch changes

- [8b661b9](https://github.com/imjlk/wp-typia/commit/8b661b9da8af050941789496064c51c25850ccd9) Added first-class validation coverage for `@wp-typia/block-types`, including
  published export-contract checks, compile-time public type fixtures, and CI
  coverage wiring so block type regressions fail fast before they leak to
  downstream packages. — Thanks @imjlk!

## 0.2.3 — 2026-04-15

### Patch changes

- [1c9916a](https://github.com/imjlk/wp-typia/commit/1c9916aa50c7e80590b35a7691b9f5fc0537ea60) Fixed published scaffold outputs so generated basic, persistence, and compound block registration files no longer rely on `registerBlockType<T>()` generic calls that break against the current published `@wordpress/blocks` type surface. Hardened the packed publish-install smoke to verify wrapper exports and to typecheck generated basic and compound scaffolds, including the compound `add-compound-child` path, against packed local release tarballs before publish. — Thanks @imjlk!

## 0.2.2 — 2026-04-15

### Patch changes

- [63657e2](https://github.com/imjlk/wp-typia/commit/63657e2182b5754aff7d40fc6218a247567c48a7) Own the generated block registration TypeScript surface in `@wp-typia/block-types`, and update scaffolds and reference examples to prefer the local registration facade over direct `@wordpress/blocks` type imports. — Thanks @imjlk!

## 0.2.1 — 2026-04-09

### Patch changes

- [ab7d1c9](https://github.com/imjlk/wp-typia/commit/ab7d1c9afaf4039b5053991ca9fe88cabcd46a13) Publish shared API client utilities and runtime primitives from `@wp-typia/api-client`, reuse them across rest and runtime packages, and align active package Bun minimums with `1.3.11`. — Thanks @imjlk!

## 0.2.0 — 2026-04-05

### Minor changes

- [a8d57c8](https://github.com/imjlk/wp-typia/commit/a8d57c8b5502c1862251038384512c316bf7ec72) Broaden `@wp-typia/block-types` support and style coverage with additional
  stable Core surfaces including `dropCap`, `backgroundImage`, `enableAlpha`,
  `spacingSizes`, `units`, `duotone`, per-side border widths, layout gaps, and
  the `js` / `locking` support keys. — Thanks @imjlk!
- [1f75a3f](https://github.com/imjlk/wp-typia/commit/1f75a3f20deae1ac13afb8c4ac9d6d2008773ff9) Add experimental `__experimentalSkipSerialization` typing for selected block
  support sections in `@wp-typia/block-types`, including a reusable
  `SkipSerialization<TFeature>` helper for Gutenberg-tracking server-style
  support metadata. — Thanks @imjlk!
- [00e148e](https://github.com/imjlk/wp-typia/commit/00e148e788160dd2564faeebc7fba530c037bce8) Add first-class WordPress block support metadata types and public style-support helper types, and teach the scaffold metadata pipeline to understand indexed-access support attributes and primitive-compatible intersections from `@wp-typia/block-types`. — Thanks @imjlk!

## 0.1.3 — 2026-03-29

### Patch changes

- [c734c7e](https://github.com/imjlk/wp-typia/commit/c734c7eede2da50ebd508cde851e32144bb1ac76) Add pipeline-compatible color and min-height aliases alongside richer DX-only template literal block types, and document which aliases are safe to use inside `types.ts` with `sync-types`. — Thanks @imjlk!

## 0.1.2 — 2026-03-29

### Patch changes

- [d89441f](https://github.com/imjlk/wp-typia/commit/d89441faf32906763807aa9bde1e960cc2ecf274) Improve Typia-powered metadata and validator generation, expand shared WordPress semantic block types, and strengthen the full/interactivity templates with precompiled validators and manifest-driven default application. — Thanks @imjlk!

## 0.1.1 — 2026-03-29

### Patch changes

- [2634593](https://github.com/imjlk/wp-typia/commit/2634593c4791272f90f01b7ddb344ab09ec418fe) Tighten the repository config baseline by fixing metadata placeholders, aligning Node and npm engine requirements, simplifying root TypeScript typecheck settings, and cleaning up CI workflow defaults. — Thanks @imjlk!

