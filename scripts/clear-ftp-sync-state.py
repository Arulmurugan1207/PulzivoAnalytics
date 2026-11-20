#!/usr/bin/env python3
"""Delete the FTP-Deploy-Action sync file so this deploy re-uploads every built file.

The action skips a remote file when its hash in .ftp-deploy-sync-state.json
matches the local file. A file overwritten on the host keeps the old hash, so
the next deploy would not replace it. Missing state is treated as success.

Plain FTP, matching the workflow. FTPS is not used until the host is tested.
Reads FTP_HOST, FTP_USERNAME, and FTP_PASSWORD from the environment and never
prints them.
"""

import os
import sys
from ftplib import FTP, error_perm


def main() -> int:
    host = os.environ.get("FTP_HOST", "").strip()
    user = os.environ.get("FTP_USERNAME", "")
    password = os.environ.get("FTP_PASSWORD", "")
    if not host or not user or not password:
        print("FTP_HOST, FTP_USERNAME, and FTP_PASSWORD are required.", file=sys.stderr)
        return 1

    name = ".ftp-deploy-sync-state.json"
    ftp = FTP(timeout=60)
    try:
        ftp.connect(host, 21)
        ftp.login(user, password)
        try:
            ftp.delete(name)
            print(f"Removed remote {name}. This deploy will upload every built file.")
        except error_perm as exc:
            message = str(exc)
            # 550: not found, which is what we want (nothing to trust).
            if message.startswith("550"):
                print(f"Remote {name} was already absent. This deploy will upload every built file.")
            else:
                print(f"Could not delete remote {name}: {message}", file=sys.stderr)
                return 1
    except Exception as exc:  # noqa: BLE001 - report the class, never the password
        print(f"FTP sync-state reset failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        try:
            ftp.quit()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
