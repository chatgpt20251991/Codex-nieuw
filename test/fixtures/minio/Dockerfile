# Test-only build of the same frozen MinIO release used by the integration suite.
# All source and base-image pins are documented in README.md.
FROM golang:1.24.2-bookworm@sha256:79390b5e5af9ee6e7b1173ee3eac7fadf6751a545297672916b59bfa0ecf6f71 AS builder

ENV CGO_ENABLED=0 \
    GOTOOLCHAIN=local
WORKDIR /src/minio

RUN curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 --retry 3 \
      https://codeload.github.com/minio/minio/tar.gz/07c3a429bfed433e49018cb0f78a52145d4bedeb \
      --output /tmp/minio-source.tar.gz \
    && printf '%s  %s\n' \
      '8819e3e7817e46b7b3798f8f200ead208562e571563c2e040352378031abe9f2' \
      '/tmp/minio-source.tar.gz' | sha256sum --check --strict \
    && tar -xzf /tmp/minio-source.tar.gz --strip-components=1 -C /src/minio \
    && rm /tmp/minio-source.tar.gz

# The pinned upstream go.mod requests toolchain go1.24.2. Dependencies are
# checked against its go.sum; the compiler cannot fetch a different toolchain.
RUN go mod download && go mod verify
RUN go build -p 2 -mod=readonly -tags kqueue -trimpath -buildvcs=false \
      -ldflags '-s -w -X github.com/minio/minio/cmd.Version=2025-09-07T16:13:09Z -X github.com/minio/minio/cmd.ReleaseTag=RELEASE.2025-09-07T16-13-09Z -X github.com/minio/minio/cmd.CommitID=07c3a429bfed433e49018cb0f78a52145d4bedeb -X github.com/minio/minio/cmd.ShortCommitID=07c3a429bfed -X github.com/minio/minio/cmd.CopyrightYear=2025' \
      -o /out/minio .

FROM debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251
LABEL org.opencontainers.image.title="EUBatteryPassport MinIO integration fixture" \
      org.opencontainers.image.description="Local test build from pinned MinIO source; not an upstream binary or production image" \
      org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.revision="07c3a429bfed433e49018cb0f78a52145d4bedeb" \
      org.opencontainers.image.version="RELEASE.2025-09-07T16-13-09Z" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
COPY --from=builder /out/minio /usr/local/bin/minio
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /src/minio/LICENSE /src/minio/CREDITS /usr/share/doc/minio-fixture/
RUN ["/usr/local/bin/minio", "--version"]
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/minio"]
CMD ["server", "/data", "--address", ":9000"]
