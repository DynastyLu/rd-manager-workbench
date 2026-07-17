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
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.git/' \
  --exclude='.husky/_/' \
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
  --include='.env.example' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.git/' \
  --exclude='.husky/_/' \
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

The following SHA-256 manifests record every imported, versioned
source-relative file. They intentionally exclude local environment files and
the generated Husky runtime directory:

| Source | Destination prefix | Content baseline | Files |
| --- | --- | --- | ---: |
| `treasure-box` | `frontend/` | [treasure-box.sha256](./treasure-box.sha256) | 153 |
| `backend-core-platform` | `backend/` | [backend-core-platform.sha256](./backend-core-platform.sha256) | 189 |

Each manifest is deterministically sorted by source-relative path and uses the
format `<sha256><two spaces><path>`. Recreate a manifest by running the
applicable rsync exclusion list above, replacing the final rsync destination
with `find`/`shasum` over source-relative regular files. A checksum mapping
check must compare the source-relative paths with the corresponding path below
the destination prefix and require identical SHA-256 values.

Commit `d554e27b0c342ee8cbcd06cf04d1d3063d8bf568` is the immutable original
framework import point. These content baselines are anchored to the same source
HEADs and porcelain-state digests recorded in the before/after snapshots, then
refined by this migration's explicit local-artifact exclusions. Do not
regenerate the original import from later source changes or alter these
baselines; record any intentional future import as a new migration and commit.

Excluded generated or machine-local artifacts, at every directory depth:

- `.git/`
- `.env`
- `.env.*` (with `.env.example` explicitly included)
- `.husky/_/`
- `node_modules/`
- `dist/`
- `coverage/`
- `playwright-report/`
- `storybook-static/`
- `test-results/`
- `var/`
- `.DS_Store`
- `stats.html` (generated bundle analysis report)

Local environment files are not copied into the targets. `.env.example` remains
included as the versioned configuration template; `frontend/.env.development`,
`backend/.env`, and any other `.env`/`.env.*` local file are excluded. The
generated `frontend/.husky/_/` runtime is also excluded; the versioned Husky
hook definitions outside that directory remain available.

## Import verification

- Framework entry points exist: `frontend/package.json`, `frontend/src/main.tsx`,
  `frontend/vite.config.ts`, `backend/package.json`, `backend/src/main.ts`, and
  `backend/prisma/schema.prisma`.
- A post-copy file-level rsync acceptance check uses the same rules above and
  accepts only directory mtime records; it reports no non-directory transfers:

  ```sh
  rsync -ain --itemize-changes <same include/exclude rules> <source>/ <target>/ \
    | awk 'substr($1, 2, 1) != "d" { print; failed = 1 } END { exit failed }'
  ```

  Directory mtime records are expected because versioned Husky hooks retain
  `frontend/.husky/`, while the generated `.husky/_/` runtime is excluded.
- All listed excluded artifacts were confirmed absent from `frontend/` and
  `backend/`.
- The checksum acceptance command compares each included source-relative path
  to the same path under `frontend/` or `backend/`, and requires both the path
  set and SHA-256 values to match the committed baselines.
