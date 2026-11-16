## Summary

<!-- What changes, and why. One or two sentences. -->

## Related issue

<!-- "Closes #123", or "No issue — small fix". -->

## Type of change

- [ ] `feat` — new user-visible capability
- [ ] `fix` — bug fix
- [ ] `docs` — documentation only
- [ ] `ci` — workflows, release automation, Dependabot
- [ ] `chore` — maintenance, no behaviour change
- [ ] `refactor` — internal change, no behaviour change
- [ ] `test` — tests only
- [ ] `perf` — performance

## What changed in behaviour

<!-- What a user can now do, see, or no longer see. Call out anything that
     touches the persisted overlay: parent links, fold state, tombstones or
     card heights. -->

## Checklist

- [ ] `npm test` passes locally.
- [ ] No hardcoded colours; new paint uses `--dsw-alias-*` tokens (`test/theme-tokens.cjs`).
- [ ] New visible copy is in the `dsh-explore` locale namespace, added to both the zh and en tables.
- [ ] No new runtime dependency and no build step.
- [ ] `README.md` and `README.zh-CN.md` updated if user-visible behaviour changed.
- [ ] `docs/design.md` or `docs/releasing.md` updated if the design or the release process changed.
- [ ] `CHANGELOG.md` not edited (Release Please owns it).
- [ ] The PR title is a Conventional Commits message; it becomes the squash commit.

## Screenshots

<!-- Required for UI changes: before and after, light and dark theme if the
     change touches colour, and a short recording for motion. -->
