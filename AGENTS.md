# Development

Standalone Paseo plugin. Runtime code uses only public plugin/SDK APIs supported by the manifest range. Client code lives in client/, server code in server/, and shared contracts/plain logic in shared/. Runtime entry files register contributions only.

Keep task state in Paseo agent records. Never manipulate daemon persistence files, grant permissions, or modify the main daemon from tests. Compatibility tests use an isolated stock npm server and explicit test provider adapters. No real provider credentials are needed for those tests; do not add auth gates.

Run npm run typecheck and npm run lint after changes, focused tests for changed behavior, and npm run format before commits. Use npm scripts for formatting/linting. Keep stock daemon integration tests sequential. Browser tests must use a real isolated daemon and browser. Do not install or enable the plugin on a user's normal daemon without permission.
