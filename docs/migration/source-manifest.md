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

The exact original import command was:

```sh
rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='coverage/' \
  --exclude='playwright-report/' \
  --exclude='storybook-static/' \
  --exclude='test-results/' \
  --exclude='var/' \
  --exclude='.DS_Store' \
  --exclude='stats.html' \
  /Users/dynastylu/Desktop/AICode/treasure-box/ \
  frontend/

rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='dist/' \
  --exclude='coverage/' \
  --exclude='playwright-report/' \
  --exclude='storybook-static/' \
  --exclude='test-results/' \
  --exclude='var/' \
  --exclude='.DS_Store' \
  --exclude='stats.html' \
  /Users/dynastylu/Desktop/AICode/backend-core-platform/ \
  backend/
```

## Content baselines

The following SHA-256 manifests record every imported source-relative file,
including files that were dirty or untracked in the source working trees:

| Source | Destination prefix | Content baseline | Files |
| --- | --- | --- | ---: |
| `treasure-box` | `frontend/` | [treasure-box.sha256](./treasure-box.sha256) | 171 |
| `backend-core-platform` | `backend/` | [backend-core-platform.sha256](./backend-core-platform.sha256) | 190 |

Each manifest is deterministically sorted by source-relative path and uses the
format `<sha256><two spaces><path>`. Recreate a manifest by running the
applicable rsync exclusion list above, replacing the final rsync destination
with `find`/`shasum` over source-relative regular files. A checksum mapping
check must compare the source-relative paths with the corresponding path below
the destination prefix and require identical SHA-256 values.

Commit `d554e27b0c342ee8cbcd06cf04d1d3063d8bf568` is the immutable import
point: it determines the imported framework content. These content baselines
are anchored to the same source HEADs and porcelain-state digests recorded in
the before/after snapshots. Do not regenerate the original import from later
source changes or alter these baselines; record any intentional future import
as a new migration and commit.

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
