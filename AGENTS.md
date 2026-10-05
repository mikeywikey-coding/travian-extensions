# Travian extension maintenance

**Every future extension change must be committed and pushed to this repository. ALWAYS. This is an explicit standing user requirement.**

- This repository is the canonical public distribution: https://github.com/mikeywikey-coding/travian-extensions.
- Keep the corresponding installed development source synchronized when editing an extension here.
- Update versions, usage documentation, and screenshots when affected. Bumping a manifest version on `main` publishes a release zip automatically (`.github/workflows/release.yml`); download counts are tracked per zip.
- Publish only distributable code and documentation; exclude credentials, browser profiles, live account data, development caches, and unrelated history.
- Portfolio repositories must link here instead of storing extension snapshots.
- Verify the push before reporting completion; report publishing blockers explicitly.
- Standing publication authorization is already provided. Do not request it again for each requested extension change.
- Keep changes focused and writing objective. Do not run tests unless the user requests them.
