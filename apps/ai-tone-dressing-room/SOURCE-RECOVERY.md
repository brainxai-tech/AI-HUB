# Source recovery status

The server retained the production `dist/`, `dist-server/`, package metadata, and verification tests, but no longer contained the original TypeScript/React source tree. These runnable artifacts are intentionally versioned so a clean clone preserves the current experience.

Do not describe this directory as fully reconstructed source. A later maintenance pass should recover or rewrite the original frontend and server TypeScript, prove output parity, and then remove the artifact exceptions from the root `.gitignore`.

The recovered runnable artifacts were subsequently unified with AI Hub routing: the server and browser bundles now accept only the Hub-selected `gpt-*` model, omit project-level credential/model controls, and do not expose a local AI preview path. This artifact-level maintenance does not change the recovery status above.
