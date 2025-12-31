#!/bin/bash
# Bump version script
# Usage: ./bump-version.sh [patch|minor|major]

VERSION_FILE="version.txt"

if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: $VERSION_FILE not found"
  exit 1
fi

VERSION=$(cat $VERSION_FILE)
MAJOR=$(echo $VERSION | cut -d. -f1)
MINOR=$(echo $VERSION | cut -d. -f2)
PATCH=$(echo $VERSION | cut -d. -f3)

case "${1:-patch}" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Usage: $0 [patch|minor|major]"
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "$NEW_VERSION" > $VERSION_FILE
echo "Version bumped: $VERSION -> $NEW_VERSION"

