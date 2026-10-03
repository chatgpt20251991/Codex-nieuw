# Frozen MinIO integration fixture

This Dockerfile builds the same upstream release already used by the integration
suite, `RELEASE.2025-09-07T16-13-09Z`, from pinned source. On 2026-09-30 the old
Quay image and the exact-digest Docker Hub mirror both rejected anonymous pulls.
The test fixture now builds locally instead of depending on those image pulls.
It is a locally built test image, not the former byte-identical upstream image.
The historical scope and limitations in `codex/GATE_4_REPORT.md` still apply.
This change does not upgrade or approve MinIO for production use.

## Verified pins

Verified on 2026-09-30 using the upstream Git refs, source archive and Docker
Official Images registry manifest APIs:

| Input | Pin |
| --- | --- |
| Upstream release | `RELEASE.2025-09-07T16-13-09Z` |
| Annotated tag object | `01ce918d8279a20e4706b96a64396146894adee4` |
| Dereferenced source commit | `07c3a429bfed433e49018cb0f78a52145d4bedeb` |
| Source archive SHA-256 | `8819e3e7817e46b7b3798f8f200ead208562e571563c2e040352378031abe9f2` |
| `golang:1.24.2-bookworm` OCI index | `sha256:79390b5e5af9ee6e7b1173ee3eac7fadf6751a545297672916b59bfa0ecf6f71` |
| `debian:bookworm-slim` OCI index | `sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251` |

The GitHub release displays a verified signed tag and commit. Its `go.mod`
declares Go 1.24.0 and toolchain 1.24.2. Both base manifests were retrieved from
`registry-1.docker.io` (`library/golang` and `library/debian`), and their response
bytes hashed to the pinned digest. Each includes Linux amd64 and arm64 images.
The 24,232,436-byte source archive was retrieved from the commit-specific
GitHub codeload URL and its checksum is checked before extraction during build.

The build follows upstream's `CGO_ENABLED=0`, `-tags kqueue` and `-trimpath`
settings. Explicit version/commit linker values replace upstream's Git-based
metadata generator because the verified source archive does not include `.git`.
`GOTOOLCHAIN=local` disables automatic toolchain replacement, `go mod verify`
checks downloaded modules, and the build uses `-mod=readonly`. Compiler
parallelism is limited to two packages to reduce CI memory pressure. The final
image includes the static binary, CA bundle, upstream LICENSE and CREDITS.

## Run and validation

From the repository root, the existing command builds the missing local image:

```sh
docker compose -f docker-compose.integration.yml up -d minio-integration
```

The build context contains only this fixture directory. It does not transfer
the repository, application configuration or secrets to Docker. The Compose
command, synthetic test credentials, CORS origin, browser setting, ephemeral
`/data` storage and `127.0.0.1:59000:9000` binding are unchanged. The binary
entrypoint receives the existing `server /data --address :9000` command.

CI must still build the image and pass the existing signed-upload, checksum,
private-storage, versioning and browser integration assertions. No test,
readiness requirement or security gate is bypassed. Docker and Go are absent
on the editing host; compilation and runtime verification therefore occur in
the required CI job, and are not claimed by this source change alone.

## Primary sources

- [Upstream signed release](https://github.com/minio/minio/releases/tag/RELEASE.2025-09-07T16-13-09Z)
- [Pinned source archive](https://codeload.github.com/minio/minio/tar.gz/07c3a429bfed433e49018cb0f78a52145d4bedeb)
- [Pinned go.mod](https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/go.mod)
- [Upstream build flags](https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/Makefile)
- [Upstream version metadata generator](https://github.com/minio/minio/blob/07c3a429bfed433e49018cb0f78a52145d4bedeb/buildscripts/gen-ldflags.go)
- [Docker Official Images Go source](https://github.com/docker-library/golang)
- [Docker Official Images Debian source](https://github.com/debuerreotype/docker-debian-artifacts)
