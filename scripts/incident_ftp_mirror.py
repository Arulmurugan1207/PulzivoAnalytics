#!/usr/bin/env python3
"""Read-only mirror of the cPanel FTP root for incident evidence.

Uses FTP_HOST, FTP_USERNAME, and FTP_PASSWORD from the environment.
Never prints those values. Only sends inspection and download commands.
"""

from __future__ import annotations

import hashlib
import json
import os
import ssl
import sys
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from ftplib import FTP, FTP_TLS
from pathlib import Path
from zoneinfo import ZoneInfo

EVIDENCE = Path("evidence")
MIRROR = EVIDENCE / "mirror"
RAW = EVIDENCE / "raw-listings"
TORONTO = ZoneInfo("America/Toronto")
MAX_FILE_BYTES = 80 * 1024 * 1024
MAX_TOTAL_BYTES = 1500 * 1024 * 1024
MAX_DEPTH = 40
MUTATING = {
    "DELE",
    "RMD",
    "MKD",
    "XMKD",
    "XRMD",
    "STOR",
    "APPE",
    "STOU",
    "RNFR",
    "RNTO",
    "ALLO",
}


def redact(text: str) -> str:
    if not isinstance(text, str):
        text = str(text)
    for key in ("FTP_PASSWORD", "FTP_USERNAME", "FTP_HOST"):
        secret = os.environ.get(key) or ""
        if secret:
            text = text.replace(secret, f"<{key}>")
    return text


class ReadOnlyMixin:
    def _guard(self, cmd: str) -> None:
        verb = cmd.strip().split(" ", 1)[0].upper()
        if verb in MUTATING:
            raise RuntimeError(f"blocked mutating FTP command {verb}")

    def sendcmd(self, cmd: str):
        self._guard(cmd)
        return super().sendcmd(cmd)

    def voidcmd(self, cmd: str):
        self._guard(cmd)
        return super().voidcmd(cmd)

    def storbinary(self, *args, **kwargs):
        raise RuntimeError("blocked STOR")

    def storlines(self, *args, **kwargs):
        raise RuntimeError("blocked STOR")


class ReadOnlyFTP(ReadOnlyMixin, FTP):
    pass


class ReadOnlyFTP_TLS(ReadOnlyMixin, FTP_TLS):
    pass


@dataclass
class Entry:
    name: str
    type: str
    size: int | None = None
    modify: str | None = None
    perm: str | None = None
    raw: dict = field(default_factory=dict)


def parse_host(raw: str) -> tuple[str, int]:
    value = raw.strip()
    if "://" in value:
        value = value.split("://", 1)[1]
    value = value.split("/", 1)[0]
    if value.startswith("[") and "]" in value:
        host, rest = value[1:].split("]", 1)
        if rest.startswith(":") and rest[1:].isdigit():
            return host, int(rest[1:])
        return host, 21
    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)
        if port.isdigit():
            return host, int(port)
    return value, 21


def valid_name(name: str) -> bool:
    if not name or name in {".", ".."}:
        return False
    if any(ch in name for ch in ("/", "\\", "\x00", "\n", "\r")):
        return False
    return True


def format_modify(modify: str | None) -> tuple[str, str]:
    if not modify or len(modify) < 14 or not modify[:14].isdigit():
        return "", ""
    dt = datetime.strptime(modify[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    utc = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    local = dt.astimezone(TORONTO).strftime("%Y-%m-%d %H:%M:%S %Z")
    return utc, local


class Mirror:
    def __init__(self) -> None:
        host = os.environ.get("FTP_HOST") or ""
        user = os.environ.get("FTP_USERNAME") or ""
        password = os.environ.get("FTP_PASSWORD") or ""
        if not host or not user or not password:
            raise SystemExit("FTP credentials are missing from the environment")
        self.host, self.port = parse_host(host)
        self.user = user
        self.password = password
        self.ftp: FTP | None = None
        self.mode = ""
        self.root = ""
        self.output = MIRROR
        self.raw = RAW
        self.files: list[dict] = []
        self.dirs: list[dict] = []
        self.errors: list[dict] = []
        self.skipped: list[dict] = []
        self.total_bytes = 0
        self.probe: dict = {}

    def connect(self) -> None:
        errors: list[str] = []
        for mode in ("plain", "tls"):
            try:
                ftp = self._open(mode)
                ftp.voidcmd("TYPE I")
                try:
                    ftp.sendcmd("OPTS UTF8 ON")
                    ftp.encoding = "utf-8"
                except Exception:
                    ftp.encoding = "latin-1"
                self.ftp = ftp
                self.mode = mode
                if not self.root:
                    self.root = ftp.pwd()
                return
            except Exception as exc:
                errors.append(f"{mode}: {redact(exc)}")
                continue
        raise SystemExit("FTP login failed: " + " | ".join(errors))

    def _open(self, mode: str) -> FTP:
        if mode == "plain":
            ftp: FTP = ReadOnlyFTP(timeout=60)
            ftp.connect(self.host, self.port, timeout=60)
            ftp.login(self.user, self.password)
        else:
            context = ssl._create_unverified_context()
            ftp = ReadOnlyFTP_TLS(context=context, timeout=60)
            ftp.connect(self.host, self.port, timeout=60)
            ftp.auth()
            ftp.login(self.user, self.password)
            ftp.prot_p()
        ftp.set_pasv(True)
        return ftp

    def safe_cmd(self, cmd: str) -> str:
        assert self.ftp is not None
        try:
            return redact(self.ftp.sendcmd(cmd))
        except Exception as exc:
            return "ERROR " + redact(exc)

    def reconnect(self) -> None:
        intended = self.root
        try:
            if self.ftp is not None:
                self.ftp.close()
        except Exception:
            pass
        self.root = ""
        self.connect()
        self.root = intended or self.root

    def cwd_rel(self, rel: str) -> None:
        assert self.ftp is not None
        self.ftp.cwd(self.root)
        for part in [p for p in rel.split("/") if p]:
            self.ftp.cwd(part)

    def record_error(self, path: str, exc: BaseException) -> None:
        self.errors.append(
            {
                "path": path,
                "error": redact(exc),
                "trace": redact(traceback.format_exc(limit=4)),
            }
        )
        print(f"ERROR {path}: {redact(exc)}", flush=True)

    def list_raw(self, command: str) -> list[str]:
        assert self.ftp is not None
        lines: list[str] = []
        self.ftp.retrlines(command, lines.append)
        return lines

    def list_entries(self) -> tuple[str, list[Entry], list[str]]:
        assert self.ftp is not None
        raw_list: list[str] = []
        try:
            raw_list = self.list_raw("LIST -a")
        except Exception as exc:
            try:
                raw_list = self.list_raw("LIST")
            except Exception as exc2:
                self.record_error("(list)", exc2)
                raw_list = [f"LIST failed: {redact(exc)} / {redact(exc2)}"]
        try:
            entries = []
            for name, facts in self.ftp.mlsd("."):
                if name in {".", ".."}:
                    continue
                size = facts.get("size")
                entries.append(
                    Entry(
                        name=name,
                        type=facts.get("type", "unknown"),
                        size=int(size) if size and str(size).isdigit() else None,
                        modify=facts.get("modify"),
                        perm=facts.get("perm"),
                        raw=dict(facts),
                    )
                )
            return "mlsd", entries, raw_list
        except Exception as exc:
            self.record_error("(mlsd)", exc)
            return "list", self.parse_list(raw_list), raw_list

    def parse_list(self, lines: list[str]) -> list[Entry]:
        entries: list[Entry] = []
        for line in lines:
            parts = line.split(maxsplit=8)
            if len(parts) < 9 or not parts[0][:1] in {"d", "-", "l"}:
                continue
            name = parts[8]
            if " -> " in name:
                name = name.split(" -> ", 1)[0]
            if name in {".", ".."}:
                continue
            kind = "dir" if parts[0].startswith("d") else "file"
            if parts[0].startswith("l"):
                kind = "link"
            size = int(parts[4]) if parts[4].isdigit() else None
            entries.append(Entry(name=name, type=kind, size=size, raw={"list": line}))
        return entries

    def save_raw(self, rel: str, raw_list: list[str], entries: list[Entry]) -> None:
        folder = self.raw / (rel if rel else "ROOT")
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "LIST.txt").write_text("\n".join(raw_list) + ("\n" if raw_list else ""), encoding="utf-8", errors="replace")
        mlsd_lines = []
        for entry in entries:
            mlsd_lines.append(json.dumps({"name": entry.name, "type": entry.type, "size": entry.size, "modify": entry.modify, "perm": entry.perm, "facts": entry.raw}, ensure_ascii=False))
        (folder / "MLSD.jsonl").write_text("\n".join(mlsd_lines) + ("\n" if mlsd_lines else ""), encoding="utf-8")

    def download_file(self, rel: str, entry: Entry, dest: Path) -> None:
        assert self.ftp is not None
        if self.total_bytes >= MAX_TOTAL_BYTES:
            self.skipped.append({"path": join_rel(rel, entry.name), "reason": "total-cap"})
            return
        size = entry.size
        if size is not None and size > MAX_FILE_BYTES:
            self.skipped.append({"path": join_rel(rel, entry.name), "reason": "file-cap", "size": size})
            return
        partial = dest.parent / (dest.name + ".partial")
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                self.cwd_rel(rel)
                self.ftp.voidcmd("TYPE I")
                digest = hashlib.sha256()
                written = 0
                too_big = False
                with partial.open("wb") as handle:
                    def callback(chunk: bytes) -> None:
                        nonlocal written, too_big
                        if too_big:
                            return
                        written += len(chunk)
                        if written > MAX_FILE_BYTES:
                            too_big = True
                            return
                        digest.update(chunk)
                        handle.write(chunk)
                    self.ftp.retrbinary("RETR " + entry.name, callback)
                if too_big:
                    partial.unlink(missing_ok=True)
                    self.skipped.append({"path": join_rel(rel, entry.name), "reason": "file-cap-during-read"})
                    return
                partial.replace(dest)
                utc, local = format_modify(entry.modify)
                if entry.modify and len(entry.modify) >= 14 and entry.modify[:14].isdigit():
                    stamp = datetime.strptime(entry.modify[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).timestamp()
                    os.utime(dest, (stamp, stamp))
                self.total_bytes += written
                self.files.append(
                    {
                        "path": join_rel(rel, entry.name),
                        "size": written,
                        "modify": entry.modify,
                        "modify_utc": utc,
                        "modify_toronto": local,
                        "perm": entry.perm,
                        "sha256": digest.hexdigest(),
                        "type": entry.type,
                    }
                )
                return
            except Exception as exc:
                last_error = exc
                partial.unlink(missing_ok=True)
                time.sleep(1 + attempt)
                self.reconnect()
        assert last_error is not None
        self.record_error(join_rel(rel, entry.name), last_error)

    def walk(self, rel: str, depth: int, skip_names: set[str] | None = None) -> None:
        if depth > MAX_DEPTH:
            self.record_error(rel or "/", RuntimeError("max depth"))
            return
        try:
            self.cwd_rel(rel)
            source, entries, raw_list = self.list_entries()
        except Exception as exc:
            self.record_error(rel or "/", exc)
            self.reconnect()
            return
        self.save_raw(rel, raw_list, entries)
        self.dirs.append({"path": rel or ".", "source": source, "count": len(entries)})
        local_dir = self.output / rel if rel else self.output
        local_dir.mkdir(parents=True, exist_ok=True)
        for entry in entries:
            if not valid_name(entry.name):
                self.record_error(join_rel(rel, entry.name), RuntimeError("rejected unsafe name"))
                continue
            if depth == 0 and skip_names and entry.name in skip_names:
                continue
            kind = entry.type.lower()
            if kind in {"cdir", "pdir"}:
                continue
            if kind == "dir" or kind.endswith("=dir"):
                self.walk(join_rel(rel, entry.name), depth + 1, skip_names)
                continue
            if "link" in kind or "symlink" in kind:
                self.files.append(
                    {
                        "path": join_rel(rel, entry.name),
                        "size": entry.size,
                        "modify": entry.modify,
                        "type": entry.type,
                        "note": "symlink-not-followed",
                        "facts": entry.raw,
                    }
                )
                continue
            self.download_file(rel, entry, local_dir / entry.name)

    def probe_access(self) -> None:
        assert self.ftp is not None
        welcome = ""
        try:
            welcome = redact(self.ftp.getwelcome())
        except Exception as exc:
            welcome = redact(exc)
        self.probe = {
            "mode": self.mode,
            "port": self.port,
            "root_pwd": self.root,
            "welcome": welcome,
            "syst": self.safe_cmd("SYST"),
            "feat": self.safe_cmd("FEAT"),
            "pwd": self.safe_cmd("PWD"),
            "parents": [],
        }
        start = self.root
        for target in ("..", "/", "/public_html", "/home"):
            item: dict = {"target": target}
            try:
                self.ftp.cwd(target)
                item["pwd"] = self.ftp.pwd()
                item["same_as_root"] = item["pwd"] == start
                try:
                    _source, entries, raw = self.list_entries()
                    item["names"] = [entry.name for entry in entries]
                    item["list_head"] = raw[:40]
                except Exception as exc:
                    item["list_error"] = redact(exc)
                self.ftp.cwd(start)
            except Exception as exc:
                item["error"] = redact(exc)
                try:
                    self.ftp.cwd(start)
                except Exception:
                    self.reconnect()
            self.probe["parents"].append(item)

    def mirror_extra_parents(self) -> None:
        """Mirror a parent the FTP user can leave, when it is this account's home.

        A chroot that cannot leave the docroot is recorded and left alone.
        A server-wide root (etc/usr/bin or many sibling accounts) is listed in
        the probe and not downloaded.
        """
        parent = next((item for item in self.probe.get("parents", []) if item.get("target") == ".."), None)
        if not parent or parent.get("same_as_root") or not parent.get("pwd"):
            self.probe["parent_mirror"] = "not-accessible"
            return
        names = parent.get("names") or []
        lowered = {name.lower() for name in names}
        if len({"etc", "usr", "bin", "var", "boot"} & lowered) >= 2 or len(names) > 80:
            self.probe["parent_mirror"] = "listed-only-wide-root"
            return
        if not ({"public_html", "www", "mail", "logs", "tmp"} & lowered) and len(names) > 40:
            self.probe["parent_mirror"] = "listed-only-unrecognized"
            return
        skip = child_dirname(parent["pwd"], self.root)
        self.probe["parent_mirror"] = "mirrored"
        self.probe["parent_skip"] = skip
        saved_root = self.root
        saved_files = self.files
        saved_dirs = self.dirs
        saved_output = self.output
        saved_raw = self.raw
        self.files = []
        self.dirs = []
        self.root = parent["pwd"]
        self.output = EVIDENCE / "parent-mirror"
        self.raw = EVIDENCE / "parent-raw-listings"
        try:
            self.walk("", 0, skip_names={skip} if skip else None)
            parent_files = self.files
            parent_dirs = self.dirs
        finally:
            self.output = saved_output
            self.raw = saved_raw
            self.root = saved_root
        for item in parent_files:
            item["tree"] = "parent"
            item["path"] = "parent/" + str(item.get("path") or "")
        self.files = saved_files + parent_files
        self.dirs = saved_dirs + [{**item, "tree": "parent", "path": "parent/" + str(item.get("path") or "")} for item in parent_dirs]

    def write_reports(self) -> None:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        listing = EVIDENCE / "listing.txt"
        lines = ["modify_utc\tmodify_toronto\tsize\ttype\tsha256\tpath"]
        for item in sorted(self.files, key=lambda row: (row.get("modify") or "", row.get("path") or "")):
            lines.append(
                "\t".join(
                    [
                        str(item.get("modify_utc") or ""),
                        str(item.get("modify_toronto") or ""),
                        str(item.get("size") if item.get("size") is not None else ""),
                        str(item.get("type") or ""),
                        str(item.get("sha256") or ""),
                        str(item.get("path") or ""),
                    ]
                )
            )
        listing.write_text("\n".join(lines) + "\n", encoding="utf-8")
        with (EVIDENCE / "manifest.jsonl").open("w", encoding="utf-8") as handle:
            for item in self.files:
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")
        (EVIDENCE / "directories.json").write_text(json.dumps(self.dirs, indent=2), encoding="utf-8")
        (EVIDENCE / "errors.json").write_text(json.dumps(self.errors, indent=2), encoding="utf-8")
        (EVIDENCE / "skipped.json").write_text(json.dumps(self.skipped, indent=2), encoding="utf-8")
        (EVIDENCE / "probe.json").write_text(json.dumps(self.probe, indent=2), encoding="utf-8")
        php = [item["path"] for item in self.files if str(item.get("path", "")).lower().endswith((".php", ".phtml", ".phar"))]
        ht = [item["path"] for item in self.files if Path(str(item.get("path", ""))).name in {".htaccess", ".user.ini", "php.ini", ".php.ini"}]
        summary = {
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "mode": self.mode,
            "root_pwd": self.root,
            "file_count": len(self.files),
            "dir_count": len(self.dirs),
            "total_bytes": self.total_bytes,
            "error_count": len(self.errors),
            "skipped_count": len(self.skipped),
            "php_files": php,
            "htaccess_and_ini": ht,
            "parent_pwds": [
                {"target": item.get("target"), "pwd": item.get("pwd"), "same_as_root": item.get("same_as_root"), "error": item.get("error")}
                for item in self.probe.get("parents", [])
            ],
        }
        (EVIDENCE / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(
            json.dumps(
                {
                    "mode": self.mode,
                    "file_count": summary["file_count"],
                    "dir_count": summary["dir_count"],
                    "total_bytes": summary["total_bytes"],
                    "error_count": summary["error_count"],
                    "skipped_count": summary["skipped_count"],
                    "php_count": len(php),
                    "htaccess_count": len(ht),
                    "parent_mirror": self.probe.get("parent_mirror"),
            "parent_same": [item.get("same_as_root") for item in summary["parent_pwds"]],
                }
            ),
            flush=True,
        )
        newest = sorted(self.files, key=lambda row: row.get("modify") or "", reverse=True)[:40]
        print("newest files:", flush=True)
        for item in newest:
            print(f"  {item.get('modify_utc','')}  {item.get('size','')}  {item.get('path')}", flush=True)


def join_rel(rel: str, name: str) -> str:
    return f"{rel}/{name}" if rel else name


def child_dirname(parent: str, root: str) -> str | None:
    parent_norm = parent.rstrip("/") or "/"
    root_norm = root.rstrip("/") or "/"
    prefix = "/" if parent_norm == "/" else parent_norm + "/"
    if not root_norm.startswith(prefix):
        return None
    rest = root_norm[len(prefix):]
    return rest.split("/")[0] or None


def main() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "started.txt").write_text(datetime.now(timezone.utc).isoformat() + "\n", encoding="utf-8")
    mirror = Mirror()
    try:
        mirror.connect()
        mirror.probe_access()
        mirror.walk("", 0)
        try:
            mirror.mirror_extra_parents()
        except Exception as exc:
            mirror.record_error("(parent)", exc)
            mirror.probe["parent_mirror"] = "failed"
        mirror.write_reports()
    except SystemExit:
        raise
    except Exception as exc:
        (EVIDENCE / "fatal.txt").write_text(redact(traceback.format_exc()), encoding="utf-8")
        print("FATAL " + redact(exc), flush=True)
        raise SystemExit(1) from exc
    if not mirror.files:
        print("No files downloaded", flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
