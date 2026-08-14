"""Read Bilibili cookies from a local DPAPI-protected or legacy text file."""

from __future__ import annotations

import base64
import ctypes
from ctypes import wintypes
import argparse
import os
from pathlib import Path


DPAPI_HEADER = b"MGS-DPAPI-V1\n"
MAX_COOKIE_BYTES = 2 * 1024 * 1024
MAX_PROTECTED_COOKIE_BYTES = 3 * 1024 * 1024


class _DataBlob(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


def _unprotect_current_user(ciphertext: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("DPAPI cookies can only be decrypted on Windows")
    if not ciphertext:
        raise ValueError("DPAPI ciphertext is empty")

    input_buffer = ctypes.create_string_buffer(ciphertext)
    input_blob = _DataBlob(
        len(ciphertext),
        ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_ubyte)),
    )
    output_blob = _DataBlob()
    crypt_unprotect = ctypes.windll.crypt32.CryptUnprotectData
    crypt_unprotect.argtypes = [
        ctypes.POINTER(_DataBlob),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(_DataBlob),
    ]
    crypt_unprotect.restype = wintypes.BOOL
    if not crypt_unprotect(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0x1,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        local_free = ctypes.windll.kernel32.LocalFree
        local_free.argtypes = [ctypes.c_void_p]
        local_free.restype = ctypes.c_void_p
        local_free(ctypes.cast(output_blob.pbData, ctypes.c_void_p))


def load_cookie_text(file_path: str) -> str:
    """Return UTF-8 cookie text without writing decrypted content to disk."""
    path = Path(file_path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("Cookie path must be a regular file")
    stat = path.stat()
    if os.name != "nt" and stat.st_mode & 0o077:
        raise PermissionError("Cookie file permissions are too broad")
    raw = path.read_bytes()
    if not raw or len(raw) > MAX_PROTECTED_COOKIE_BYTES:
        raise ValueError("Cookie file is empty or too large")

    if raw.startswith(DPAPI_HEADER):
        encoded = b"".join(raw[len(DPAPI_HEADER):].split())
        try:
            protected = base64.b64decode(encoded, validate=True)
        except ValueError as error:
            raise ValueError("DPAPI cookie payload is invalid") from error
        plaintext = _unprotect_current_user(protected)
    else:
        if os.name == "nt" and os.getenv("ALLOW_PLAINTEXT_BILI_COOKIE") != "true":
            raise PermissionError("Plaintext Bilibili cookies are disabled on Windows")
        plaintext = raw

    if len(plaintext) > MAX_COOKIE_BYTES:
        raise ValueError("Decrypted cookie payload is too large")
    return plaintext.decode("utf-8-sig", errors="strict")


def iter_cookie_fields(file_path: str):
    """Yield normalized Netscape or simple TSV cookie fields."""
    for raw_line in load_cookie_text(file_path).splitlines():
        line = raw_line.strip()
        if line.startswith("#HttpOnly_"):
            line = line[len("#HttpOnly_"):]
        elif not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) == 1:
            parts = line.split()
        if len(parts) >= 7 and parts[1] in ("TRUE", "FALSE") and parts[3] in ("TRUE", "FALSE"):
            domain, _flag, cookie_path, _secure, _expiry, name, value = parts[:7]
            yield name, value, domain, cookie_path or "/"
        elif len(parts) >= 4:
            name, value, domain, cookie_path = parts[:4]
            if name.lower() not in ("name", "cookie") and domain:
                yield name, value, domain, cookie_path or "/"
        elif len(parts) >= 2:
            name, value = parts[:2]
            if name.lower() not in ("name", "cookie"):
                yield name, value, ".bilibili.com", "/"


def load_playwright_cookies(file_path: str):
    return [
        {"name": name, "value": value, "domain": domain, "path": cookie_path}
        for name, value, domain, cookie_path in iter_cookie_fields(file_path)
    ]


def load_cookie_values(file_path: str):
    return {name: value for name, value, _domain, _path in iter_cookie_fields(file_path)}


def main():
    parser = argparse.ArgumentParser(description="Verify a protected Bilibili cookie file")
    parser.add_argument("--verify", required=True, metavar="PATH")
    args = parser.parse_args()
    names = {cookie["name"] for cookie in load_playwright_cookies(args.verify)}
    if not {"SESSDATA", "bili_jct"}.issubset(names):
        raise ValueError("Cookie file is missing required fields")
    print("valid")


if __name__ == "__main__":
    main()
