# Contributing to getbased

Thanks for wanting to help. This is the short version — the in-depth contributor docs live in [`dev-docs/`](dev-docs/).

---

## Running locally

```bash
git clone https://github.com/elkimek/get-based
cd get-based
node dev-server.js
```

Open `http://localhost:8000`. No install step, no build step — getbased is native ES modules loaded directly by the browser.

Prerequisites: a modern browser (Chrome or Firefox), Node.js for the dev server, and Puppeteer (`npm install`) if you want to run the test suite. An AI provider key or a local Ollama instance is optional — only needed for PDF import and chat.

---

## Tests

```bash
./run-tests.sh
```

Auto-starts a server, runs every `tests/test-*.js` through headless Chrome, and prints pass/fail per file. Exit code 0 = all pass. If you add a feature or fix a bug, add assertions to the relevant test file. See [`dev-docs/testing.md`](dev-docs/testing.md) for how the harness works.

---

## Pull request guidelines

- Keep PRs focused. One thing at a time is easier to review.
- Run `./run-tests.sh` before opening a PR.
- If you touch any app file (JS, CSS, HTML, manifest), bump the version in `version.js` — this busts the service worker cache for existing users.
- Update [`CLAUDE.md`](CLAUDE.md) if you change architecture, add a module, or change how something works at a system level.

---

## Architecture & deeper docs

- **[CLAUDE.md](CLAUDE.md)** — the comprehensive architecture reference: data flow, every module, storage keys, the AI pipeline. Read it before any non-trivial change.
- **[`dev-docs/`](dev-docs/)** — contributor guides: architecture, module reference, data pipeline, storage schema, testing, deployment, and more. Start at the [docs map](dev-docs/README.md).

---

## Roadmap

Check the [project board](https://github.com/users/elkimek/projects/2) for planned features and ideas. If something interests you, comment on the issue to discuss the approach before starting work.

## Reporting bugs

Open a GitHub issue or use the feedback button in the app (flag icon in the header). Include browser, OS, and steps to reproduce.
