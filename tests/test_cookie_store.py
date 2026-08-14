import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from workers.bilibili.cookie_store import load_cookie_values, load_playwright_cookies


class CookieStoreTests(unittest.TestCase):
    def test_netscape_http_only_records_are_parsed(self):
        content = "\n".join([
            "# Netscape HTTP Cookie File",
            "#HttpOnly_.bilibili.com\tTRUE\t/\tTRUE\t0\tSESSDATA\tsession-value",
            ".bilibili.com\tTRUE\t/\tTRUE\t0\tbili_jct\tcsrf-value",
        ])
        with tempfile.TemporaryDirectory() as directory:
            cookie_path = Path(directory, "cookie.txt")
            cookie_path.write_text(content, encoding="utf-8")
            cookie_path.chmod(0o600)
            with patch.dict(os.environ, {"ALLOW_PLAINTEXT_BILI_COOKIE": "true"}):
                cookies = load_playwright_cookies(str(cookie_path))
                values = load_cookie_values(str(cookie_path))

        self.assertEqual(values["SESSDATA"], "session-value")
        self.assertEqual(values["bili_jct"], "csrf-value")
        self.assertEqual(cookies[0]["domain"], ".bilibili.com")

    @unittest.skipIf(os.name == "nt", "POSIX permission check")
    def test_plaintext_cookie_permissions_must_be_private(self):
        with tempfile.TemporaryDirectory() as directory:
            cookie_path = Path(directory, "cookie.txt")
            cookie_path.write_text("SESSDATA\tvalue", encoding="utf-8")
            cookie_path.chmod(0o644)
            with self.assertRaises(PermissionError):
                load_cookie_values(str(cookie_path))


if __name__ == "__main__":
    unittest.main()
