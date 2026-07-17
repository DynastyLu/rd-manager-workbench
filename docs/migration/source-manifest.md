# Real Framework Import Manifest

## Sources and destinations

| Destination | Source | Source HEAD | Imported baseline |
| --- | --- | --- | --- |
| `frontend/` | `/Users/dynastylu/Desktop/AICode/treasure-box` | `87c7ad0a34cc83f150a82f102736699a510d3dcc` | The source working tree as captured before copy, including its existing uncommitted files and modifications. |
| `backend/` | `/Users/dynastylu/Desktop/AICode/backend-core-platform` | `b7c1885cf03ea7e3869483bae42ca8f7a9797611` | The source working tree as captured before copy, including its existing uncommitted files and modifications. |

## Copy contract

The source directories were treated as read-only. This migration copied their
working-tree contents with `rsync -a`; it did not run any write command in
either source repository. Source status snapshots are recorded in
[source-status.before.md](./source-status.before.md) and
[source-status.after.md](./source-status.after.md). Their matching HEADs and
porcelain-status SHA-256 digests prove the before/after source status diff is
empty.

Excluded generated or machine-local artifacts, at every directory depth:

- `.git/`
- `node_modules/`
- `dist/`
- `coverage/`
- `playwright-report/`
- `storybook-static/`
- `test-results/`
- `var/`
- `.DS_Store`
- `stats.html` (generated bundle analysis report)

Source environment files were preserved by the copy. The target workspace's
Git ignore rules keep `frontend/.env.development` and `backend/.env` out of
version control, so no local credentials are included in this migration
commit.

## Import verification

- Framework entry points exist: `frontend/package.json`, `frontend/src/main.tsx`,
  `frontend/vite.config.ts`, `backend/package.json`, `backend/src/main.ts`, and
  `backend/prisma/schema.prisma`.
- A post-copy `rsync --dry-run` reported zero pending files for both imports
  under the exclusion rules above.
- All listed excluded artifacts were confirmed absent from `frontend/` and
  `backend/`.
