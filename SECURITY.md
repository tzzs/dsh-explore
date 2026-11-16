# Security policy

## Supported versions

This project is pre-1.0. It is distributed through the npm registry as `@tanzz/dsh-explore` and as a `.tgz` attachment on each GitHub Release. Only the latest release is supported.

| Version | Supported |
| --- | --- |
| Latest `v*` release | Yes |
| `main` | Yes, as development code without release guarantees |
| Older releases | No — upgrade to the latest release |

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting:

https://github.com/tzzs/dsh-explore/security/advisories/new

Do not open a public issue, discussion or pull request for a security problem. No email address is published; the advisory form is the private channel.

Please include:

- the plugin version or commit, and how it was installed (release tag, `.tgz` attachment or a clone);
- the DSH version and build (desktop or web), and the operating system;
- a minimal reproduction — for example the session events or persisted JSON that trigger the problem;
- the impact: what an attacker could read, write or execute.

## What to expect

- An acknowledgement within 7 days.
- An assessment, then a fix or mitigation in the next release, or a patch on `main` when the issue affects development code.
- Coordinated disclosure: we agree on a date, then the advisory is published with credit unless you prefer to stay anonymous. This project has no bug bounty.

## Scope

This is a client-side DSH plugin. It makes no network requests of its own. It reads conversation events from the host, renders Markdown into DSH's renderer, creates and archives sessions through DSH's `sessions` API, and keeps an overlay in `localStorage` (parent links, fold state, tombstones, card heights).

In scope:

- Markdown or HTML injection, or script execution, in cards, the reader overlay or the inline composer.
- Conversation data leaking outside the intended `localStorage` keys, or written where another plugin or page can read it.
- Prototype pollution or unsafe object merges when persisted JSON is parsed back.
- Denial of service through crafted session events, such as unbounded projection, layout or render loops.
- Supply-chain problems in the release artifacts: the `@tanzz/dsh-explore` package on npm, the `.tgz` attachment published on a release, or the pinned GitHub Actions in the workflows.

Out of scope:

- Vulnerabilities in DeepSeek Harness itself. Report those to the DSH project.
- Anything that requires an already-compromised local profile, browser or operating-system account.
