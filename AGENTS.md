# Repository Guidelines

## Project Structure & Module Organization

This repository is a Cloudflare Worker for uploading static assets into R2 and serving them through encrypted URLs. The main entrypoint is `src/index.ts`, while request handling, config parsing, upload logic, referer policy checks, token helpers, and image/watermark processing live under `src/`. Runtime settings live in local `wrangler.jsonc`; use committed `wrangler.example.jsonc` as the template because `wrangler.jsonc` is intentionally ignored. Generated binding types belong in `worker-configuration.d.ts`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies from `pnpm-lock.yaml`.
- `pnpm dev`: start local development with Wrangler against `src/index.ts`.
- `pnpm deploy`: deploy the Worker with minification enabled.
- `pnpm cf-typegen`: regenerate Cloudflare binding types after changing `wrangler.jsonc` bindings.
- `pnpm test`: run the native Node test suite against the Worker modules and Hono app.

There is no separate bundling step beyond Wrangler deploy.

## Coding Style & Naming Conventions

Use TypeScript with strict compiler settings and ES module syntax. Follow the existing style in [src/index.ts](/Users/marco/Documents/git/github.com/BeaversLab/r2-static-service/src/index.ts): 2-space indentation, single quotes, semicolon-free statements, and small helper functions. Prefer descriptive camelCase names such as `resolvePolicyAction`; reserve uppercase names for environment bindings like `BUCKET`, `IMAGES`, `UPLOAD_BEARER_TOKEN`, and `TOKEN_SECRET`.

## Testing Guidelines

Add coverage in `test/*.test.ts` using the built-in Node test runner. Validate upload auth, encrypted token handling, referer policy selection, non-image passthrough, and image transformation behavior. For manual checks, run `pnpm dev`, upload through `PUT /upload` with a `file` field, then verify `GET /:token/:seoFilename` for both raw files and transformed images.

## Commit & Pull Request Guidelines

Recent history uses short, imperative subjects with occasional Conventional Commit prefixes, for example `feat: support Cloudflare Images` and `docs: fix format`. Follow that pattern: keep the subject brief, lead with the change, and use prefixes like `feat:`, `fix:`, `docs:`, or `chore:` when helpful.

Pull requests should describe behavior changes, mention any Cloudflare or R2 configuration impact, and include reproducible verification steps. Add request/response examples when changing upload auth, encrypted URL shape, cache behavior, referer rules, or image processing.

When changing repository metadata, keep `package.json`, `LICENSE`, and supporting docs aligned. This repository now uses Apache 2.0, so new docs and package metadata should reference `Apache-2.0`.

## Security & Configuration Tips

Never commit real credentials or production bucket identifiers. Keep `UPLOAD_BEARER_TOKEN` and `TOKEN_SECRET` in Wrangler secrets, start from `wrangler.example.jsonc`, and keep `REFERER_ALLOWLIST`/`WATERMARK_SCHEMES_JSON` as structured JSON values instead of stringified blobs. Review cache keys carefully when changing watermark or referer policy behavior.

Keep local-only files out of git. `.gitignore` should continue to exclude local Wrangler config (`wrangler.jsonc`, `wrangler.toml`), env files (`.env*`, `.dev.vars*`), build/runtime directories, and non-pnpm lockfiles unless the project intentionally switches package managers.
