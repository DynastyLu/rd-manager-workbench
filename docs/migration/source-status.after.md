# Source Status Snapshot (After Import)

Captured immediately after the framework copy with the same commands as the
before snapshot:

```sh
git -C <source> status --short --branch --untracked-files=normal
git -C <source> status --porcelain=v1 --untracked-files=normal | shasum -a 256
```

| Source | Branch and HEAD | Porcelain SHA-256 |
| --- | --- | --- |
| `/Users/dynastylu/Desktop/AICode/treasure-box` | `master` at `87c7ad0a34cc83f150a82f102736699a510d3dcc` | `613a57b2e541f64937611419ab94a9501bc2c454a015c81724d3049196efc743` |
| `/Users/dynastylu/Desktop/AICode/backend-core-platform` | `main` at `b7c1885cf03ea7e3869483bae42ca8f7a9797611` | `5dd1d001e6390187d7ad92b19dbe16c4a3a5b0c9c25ab1cc3a8afc68ccb7badd` |

Both digests and both HEADs match
[the before snapshot](./source-status.before.md), so a diff of the source
porcelain status before and after the import is empty. The full before status
is retained there to record the source working-tree baseline used for this
copy.
