#!/bin/bash
set -e
mkdir -p /tmp/gotc
cd /tmp/gotc
fetch() {
  if [ ! -f "go$1.tar.gz" ]; then
    curl -fsSL -o "go$1.tar.gz" "https://codeload.github.com/golang/go/tar.gz/go$1"
  fi
  if [ ! -d "gosrc-$1" ]; then
    mkdir -p "gosrc-$1"
    tar -xzf "go$1.tar.gz" -C "gosrc-$1" --strip-components=1
  fi
}
dstof() { echo "go$(echo "$1" | sed 's/\./_/g')src"; }
build() {
  local ver="$1"; shift
  local boot="$1"; shift
  local dst
  dst="$(dstof "$ver")"
  if [ ! -x "$dst/bin/go" ]; then
    rm -rf "$dst"
    cp -a "gosrc-$ver" "$dst"
    if [ "$boot" = none ]; then
      (cd "$dst/src" && env "$@" ./make.bash) >/tmp/gotc/build-$ver.log 2>&1
    else
      (cd "$dst/src" && GOROOT_BOOTSTRAP="/tmp/gotc/$boot" GOROOT_FINAL="/tmp/gotc/$dst" env "$@" ./make.bash) >/tmp/gotc/build-$ver.log 2>&1
    fi
  fi
  echo "BUILT $ver -> $dst/bin/go"
}
fetch 1.4.3
build 1.4.3 none CGO_ENABLED=0 CC="gcc -fcommon"
fetch 1.17.13
build 1.17.13 "$(dstof 1.4.3)"
fetch 1.20.14
build 1.20.14 "$(dstof 1.17.13)"
fetch 1.23.0
build 1.23.0 "$(dstof 1.20.14)"
echo BOOTSTRAP_DONE
/tmp/gotc/"$(dstof 1.23.0)"/bin/go version
