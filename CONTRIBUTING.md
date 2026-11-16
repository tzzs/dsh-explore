# Contributing

Thanks for taking the time to contribute. This is a small, single-maintainer plugin, so the most useful contributions are focused bug reports, fixes with a regression test, and corrections to the documentation.

## Read first

- [docs/design.md](docs/design.md) — the intent, the goals and non-goals in §2, the data model in §4, the trade-offs in §7 and the known gaps in §9. A change that contradicts a non-goal needs a design discussion before code.
- [docs/releasing.md](docs/releasing.md) — CI, Release Please, versioning, and what to do when a release fails.

## Development setup

- Node.js 22 or newer. CI runs Node.js 22 and 24 on Ubuntu and Windows; `.nvmrc` records the version used locally.
- No `npm install`, no build step and no lockfile: the plugin and its tests have zero npm dependencies and ship as plain files.
- `client.js` is loaded through `window.__ModuleLoader__.load`. DSH replaces the module when the file's mtime or size changes, so an edit is picked up without restarting the app or refreshing the page.
- The stylesheet is rewritten on every `apply()`. Do not add an "already injected, skip" guard, or new rules will never appear after a hot swap.
- To run it, install `@tanzz/dsh-explore` from npm, or point DSH's plugin manager (`install_bundle`) at a clone of this repository; see [README.md](README.md).

## Tests

`npm test` runs all six checks:

| Command | What it locks down |
| --- | --- |
| `node --check client.js` | Parses the client module, so a syntax error is caught before the app loads it. |
| `node test/render-smoke.cjs` | Renders the whole view with a fake React and asserts the zh and en copy, the tab label and the default fold. |
| `node test/canvas-visibility.cjs` | Projection and visibility: running and waiting nodes are laid out and drawn, waiting labels appear, question replies are kept, and the zh/en key sets stay identical. |
| `node test/session-rebind.cjs` | Re-binding: resubscribes to the new `eventSource`, unsubscribes the dropped one, does not prune on an empty window, and opens a cold session. |
| `node test/theme-tokens.cjs` | No literal colours, only known `--dsw-alias-*` tokens, and the primary-button foreground pairing. |
| `node test/motion.cjs` | Camera interpolation, gesture interruption, navigation replacement, reduced motion and unmount cleanup. |

Tests run in plain Node with stubbed React and DOM — no test framework, no browser, no bundler. `node:assert` is fine. Add or extend a test for every behaviour change; a fix without a regression test is hard to accept.

## Repository layout

| Path | Contents |
| --- | --- |
| `client.js` | The whole client view: event projection, layout, canvas, cards, reader overlay. |
| `index.js` | Host half; `apply()` is empty because the plugin does all its work in the client. |
| `cordis.patch.yml` | Inserts the plugin into a DSH profile. |
| `locale/zh.json`, `locale/en.json` | Plugin display name and description. |
| `test/*.cjs` | The six checks above. |
| `docs/design.md`, `docs/releasing.md` | Design record and release operations. |
| `.github/workflows/` | CI, Release Please and the manual npm publish workflow. |

## Coding rules

These are enforced by `npm test`, not by taste:

- **Colours go through theme tokens.** Every painted colour must resolve through one of the `--dsw-alias-*` tokens listed in `test/theme-tokens.cjs`. Literal hex, `rgb()`/`hsl()` values, named colours and unknown token names fail the suite. The only exemptions are an alpha stencil (`#000` inside `maskImage`) and black alpha inside a shadow value; `color-mix()` is allowed because the tokens it mixes are the paint.
- **Primary buttons pair their foreground.** Use `--dsw-alias-label-primary-foreground` for the label on the primary fill (`--dsw-alias-button-primary-fill`, hover `--dsw-alias-button-primary-hover`). The brand accent `--dsw-alias-brand-primary` inverts between the light and dark theme, so a hardcoded `#fff` becomes invisible in one of them.
- **All visible copy is localised.** Text goes through the `dsh-explore` locale namespace: the built-in zh/en tables in `client.js` are registered with the locale service and also serve as the fallback when a profile has no locale plugin. `locale/zh.json` and `locale/en.json` carry the display name and description. A new key needs both built-in tables; the visibility test fails if the two key sets diverge.
- **Never fold the path to a running or waiting node.** Layout only visits unfolded nodes, and a folded node has no position, so it is never drawn. That is why the default fold is bypassed for the ancestor path of anything running or waiting on the user.
- **Subscriptions follow `eventSource` re-binds.** When a retained scope is released and re-materialised, DSH mints a new `Session` and a new `eventSource` with an empty window. Unsubscribe the old source, subscribe to the new one, do not prune the store from an empty window, and `open()` a cold session once.
- **Motion respects `prefers-reduced-motion`.** Displacement, bounce and fades are disabled when the user asks for reduced motion, and turning the preference on finishes the current camera move immediately. Gestures and unmount cancel interpolation.
- **No new runtime dependencies.** The plugin ships as plain files with no bundler; a new npm package would add an install and build step this repository does not have.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The type decides the next version, so pick it deliberately:

| Type | Use for |
| --- | --- |
| `feat` | A new user-visible capability. |
| `fix` | A bug fix. |
| `docs` | README, `docs/`, comments. |
| `ci` | Workflows, Release Please, Dependabot. |
| `chore` | Maintenance that changes no behaviour. |
| `refactor` | Internal change with no behaviour change. |
| `test` | Test-only change. |
| `perf` | Performance improvement. |

Real examples from the history:

```
feat(motion): add restrained interaction motion to the canvas (#14)
fix(canvas): keep in-progress cards visible and survive session re-bind (#4)
ci: add GitHub Actions and Release Please automation
```

The scope is optional; use one when it helps (`canvas`, `card`, `theme`, `i18n`).

Release Please derives the version and `CHANGELOG.md` from these messages: `feat` bumps the minor version, `fix` bumps the patch version while the project is pre-1.0, and `docs`/`ci`/`chore` do not cut a release on their own. If you squash-merge, the PR title becomes the commit, so it must be conventional too.

Do not run `npm version` or `npm publish`, edit `.release-please-manifest.json`, create or push `v*` tags, or edit `CHANGELOG.md`. Release Please and the release workflow own all of them: the package is `@tanzz/dsh-explore`, and a manual version or publish desynchronises the tag, the GitHub Release and the registry.

## Pull requests

1. Branch from `main`.
2. Run `npm test` locally. CI runs the same checks on Ubuntu and Windows with Node.js 22 and 24, plus `node --check index.js` and `npm pack --dry-run`.
3. Fill in the PR template; include before/after screenshots (and light/dark, if the change touches colour) for UI changes.
4. Keep the PR to one behaviour change where possible, and add a test for it.
5. Update `docs/design.md` or `docs/releasing.md` when the design or the release process changes.
6. Keep [README.md](README.md) and [README.zh-CN.md](README.zh-CN.md) in sync when user-visible behaviour changes.

CI must be green before a PR is merged. Issues and PRs are welcome in English or Chinese; the maintainer replies in the language you use.
