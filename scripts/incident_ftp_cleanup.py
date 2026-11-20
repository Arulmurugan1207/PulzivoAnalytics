#!/usr/bin/env python3
"""Delete the injected files found in the 2026-11-20 FTP evidence mirror.

Uses FTP_HOST, FTP_USERNAME, and FTP_PASSWORD from the environment.
Never prints those values. Deletes only the allow-listed paths below.
"""

from __future__ import annotations

import json
import os
import ssl
import sys
from ftplib import FTP, FTP_TLS, error_perm

# Exact paths from the evidence manifest. Nothing else is removed.
DELETE_FILES = [
    "pricing.html",
    "features.html",
    "docs.html",
    "contact.html",
    "googlec6a347bbda5b0ae1.html",
    "googleab7dc7f91204aed1.html",
    "mnzxmn/TechnologiesGmbH.htm",
    "updatecnc/index.html",
    "updatecnc/process.php",
    "updatecnm/index.html",
    "updatecnm/process.php",
    # Reset FTP-Deploy-Action so the following upload sends every build file.
    ".ftp-deploy-sync-state.json",
]
DELETE_DIRS = ["mnzxmn", "updatecnc", "updatecnm"]
PROTECTED = {
    ".ftpquota",
    ".htaccess",
    "index.html",
    "sitemap.xml",
    "robots.txt",
    "public_html",
    ".well-known",
    "cgi-bin",
}


def redact(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    for key in ("FTP_PASSWORD", "FTP_USERNAME", "FTP_HOST"):
        secret = os.environ.get(key) or ""
        if secret:
            text = text.replace(secret, f"<{key}>")
    return text


def assert_deletable(path: str, *, directory: bool = False) -> None:
    allowed = DELETE_DIRS if directory else DELETE_FILES
    if path not in allowed:
        raise SystemExit(f"refusing path that is not allow-listed: {path}")
    parts = path.split("/")
    if path.startswith("/") or any(part in {"", ".", ".."} for part in parts):
        raise SystemExit(f"refusing unsafe path: {path}")
    if parts[0] in PROTECTED or path in PROTECTED:
        raise SystemExit(f"refusing protected path: {path}")


def parse_host(raw: str) -> tuple[str, int]:
    value = raw.strip()
    if "://" in value:
        value = value.split("://", 1)[1]
    value = value.split("/", 1)[0]
    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        if port.isdigit():
            return host, int(port)
    return value, 21


def connect() -> tuple[FTP, str]:
    host_raw = os.environ.get("FTP_HOST") or ""
    user = os.environ.get("FTP_USERNAME") or ""
    password = os.environ.get("FTP_PASSWORD") or ""
    if not host_raw or not user or not password:
        raise SystemExit("FTP credentials are missing from the environment")
    host, port = parse_host(host_raw)
    errors: list[str] = []
    for mode in ("plain", "tls"):
        try:
            if mode == "plain":
                ftp: FTP = FTP(timeout=60)
                ftp.connect(host, port, timeout=60)
                ftp.login(user, password)
            else:
                context = ssl._create_unverified_context()
                ftp = FTP_TLS(context=context, timeout=60)
                ftp.connect(host, port, timeout=60)
                ftp.auth()
                ftp.login(user, password)
                ftp.prot_p()
            ftp.set_pasv(True)
            return ftp, mode
        except Exception as exc:
            errors.append(f"{mode}: {redact(exc)}")
    raise SystemExit("FTP login failed: " + " | ".join(errors))


def already_gone(exc: Exception) -> bool:
    text = str(exc)
    return isinstance(exc, error_perm) and ("550" in text or "553" in text)


def main() -> None:
    for path in DELETE_FILES:
        assert_deletable(path)
    for path in DELETE_DIRS:
        assert_deletable(path, directory=True)
    ftp, mode = connect()
    deleted: list[dict] = []
    try:
        root = ftp.pwd()
        print(json.dumps({"event": "connected", "mode": mode, "root_is_slash": root == "/"}), flush=True)
        for path in DELETE_FILES:
            assert_deletable(path)
            try:
                reply = ftp.delete(path)
                deleted.append({"path": path, "action": "DELE", "result": redact(reply)})
                print(f"DELE {path} {redact(reply)}", flush=True)
            except Exception as exc:
                if already_gone(exc):
                    deleted.append({"path": path, "action": "DELE", "result": "already-absent"})
                    print(f"DELE {path} already-absent", flush=True)
                else:
                    print(f"DELE {path} FAILED {redact(exc)}", flush=True)
                    raise
        for path in DELETE_DIRS:
            assert_deletable(path, directory=True)
            try:
                reply = ftp.rmd(path)
                deleted.append({"path": path, "action": "RMD", "result": redact(reply)})
                print(f"RMD {path} {redact(reply)}", flush=True)
            except Exception as exc:
                if already_gone(exc):
                    deleted.append({"path": path, "action": "RMD", "result": "already-absent"})
                    print(f"RMD {path} already-absent", flush=True)
                else:
                    print(f"RMD {path} FAILED {redact(exc)}", flush=True)
                    raise
    finally:
        try:
            ftp.quit()
        except Exception:
            pass
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write("## Files deleted from the cPanel docroot\n\n")
            for item in deleted:
                handle.write(f"- `{item['action']} {item['path']}` — {item['result']}\n")
    print(json.dumps({"deleted": deleted}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print("FATAL " + redact(exc), flush=True)
        sys.exit(1)
