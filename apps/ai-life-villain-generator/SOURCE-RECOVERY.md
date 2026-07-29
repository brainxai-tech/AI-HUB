# Source recovery status

The server retained the production `dist/`, `dist-server/`, package metadata, and verification tests, but no longer contained the original TypeScript/React source tree. These runnable artifacts are intentionally versioned so a clean clone preserves the current experience.

Do not describe this directory as fully reconstructed source. A later maintenance pass should recover or rewrite the original frontend and server TypeScript, prove output parity, and then remove the artifact exceptions from the root `.gitignore`.

The retained production artifacts have been updated in place to use only the AI Hub project-scoped GPT route. The browser no longer exposes provider, model, or API-key controls; model changes come from the shared selector at the top of the page. This routing repair does not change the source-recovery status above.
