# Version maintenance

Project Relay provides two version-doctor commands:

```bash
npm run versions:check
npm run versions:update
```

`versions:check` inspects direct registry dependencies without changing files. `versions:update` displays the same report and, when conservative updates are available, asks for an explicit `[y/N]` response before applying them.

Automatic updates are restricted to stable same-major releases. For dependencies below version 1.0, only patch updates within the current minor version are eligible. Major releases, prereleases, pre-1.0 minor releases, and non-exact specifications remain manual-review items.

Before applying an update, the doctor requires a clean Git worktree. It installs exact versions through npm with dependency lifecycle scripts disabled, regenerates the lockfile, runs `npm run check`, and performs `npm audit --audit-level=moderate`. It never commits or pushes.

Node.js and global npm upgrades remain manual because safe installation is platform-specific. Their current and configured versions are included in the report.
