# Source from an entry point; Pillow lives only in a disposable external venv.
if [ -z "${FACE_PYTHON:-}" ]; then
    FACE_TEMP=$(mktemp -d "${TMPDIR:-/tmp/}usagi-face-python-XXXXXX")
    trap 'rm -rf "$FACE_TEMP"' EXIT HUP INT TERM
    python3 -m venv "$FACE_TEMP/venv"
    FACE_PYTHON="$FACE_TEMP/venv/bin/python"
    "$FACE_PYTHON" -m pip --disable-pip-version-check -q install 'Pillow==11.3.0'
fi
export FACE_PYTHON
