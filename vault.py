#!/usr/bin/env python3
"""Vault — theme.js
   h5ai-inspired directory listing using a python script
   Author : Abhiraj Bibhar
   Github : https://github.com/abhirajbibhar"""

import os
import json
import time
import sys
from pathlib import Path
from html import escape

# ── Config ───────────────────────────────────────────────
CONFIG = {
    "max_files": 20_000,
    "server_port": 2104,
    "icon_file": "icon.json",
}

# ── Helpers ──────────────────────────────────────────────

def format_size(num_bytes):
    if num_bytes is None:
        return "-"
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} PB"


def format_mtime(ts):
    try:
        return time.strftime("%Y-%m-%d %H:%M", time.localtime(ts))
    except Exception:
        return "-"


def load_icons():
    try:
        with open(CONFIG["icon_file"], "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print("⚠ icon.json not found, using default icons")
        return {}


def get_folder_size(path):
    total = 0
    file_count = 0
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if not f.startswith("."):
                try:
                    total += os.path.getsize(os.path.join(root, f))
                    file_count += 1
                except Exception:
                    pass
    return total, file_count


def build_structure(path, base_dir, label=None):
    rel = os.path.relpath(path, base_dir).replace("\\", "/")
    struct = {
        "label": label or os.path.basename(path) or "Vault",
        "files": [],
        "subdirs": {},
        "size": 0,
        "file_count": 0,
        "path": "" if rel in (".", "") else rel,
        "modified": format_mtime(os.path.getmtime(path))
    }
    try:
        entries = os.listdir(path)
    except Exception as e:
        print(f"⚠️ Error reading directory {path}: {e}")
        return struct
    for entry in entries:
        if entry.startswith("."):
            continue
        full = os.path.join(path, entry)
        relp = os.path.relpath(full, base_dir).replace("\\", "/")
        if os.path.isfile(full):
            size = os.path.getsize(full)
            ext = Path(entry).suffix.lower().lstrip(".") or Path(entry).name.lower()
            struct["files"].append({
                "name": entry,
                "path": relp,
                "size": size,
                "modified": format_mtime(os.path.getmtime(full)),
                "ext": ext
            })
            struct["size"] += size
            struct["file_count"] += 1
        elif os.path.isdir(full):
            sub = build_structure(full, base_dir, entry)
            struct["subdirs"][entry] = sub
            struct["size"] += sub["size"]
            struct["file_count"] += sub["file_count"]
    return struct


def write_structure_json(base_dir):
    struct = build_structure(base_dir, base_dir, "Vault")
    root = {
        "label": "Vault",
        "size": struct["size"],
        "file_count": struct["file_count"],
        "modified": struct["modified"],
        "structure": struct
    }
    with open(os.path.join(base_dir, "structure.json"), "w", encoding="utf-8") as f:
        json.dump({"root": root}, f, indent=2)


def get_icon(name, is_dir, icons):
    if is_dir:
        return '<span class="material-symbols-outlined">folder</span>'
    ext = Path(name).suffix.lower().lstrip(".") or Path(name).name.lower()
    icon_name = icons.get(ext, "insert_drive_file")
    return f'<span class="material-symbols-outlined">{icon_name}</span>'


def build_tree_html(struct, current_rel=""):
    html = '<ul class="nav">'
    for name, sub in struct["subdirs"].items():
        path = sub["path"]
        is_active = (path == current_rel)
        has_children = bool(sub["subdirs"])
        expanded_class = " expanded" if current_rel.startswith(path) else ""

        href = f"/{escape(path)}/index.html" if path else "/index.html"
        arrow_html = '<span class="material-symbols-outlined toggle">chevron_right</span>' if has_children else ""
        icon = "folder_open" if (is_active or expanded_class) else "folder"

        html += f"""
          <li class="folder{expanded_class}{' active' if is_active else ''}">
            <div class="folder-label" data-path="{escape(path)}">
              <a href="{href}">
                <span class="material-symbols-outlined">{icon}</span> {escape(name)}
              </a>
              {arrow_html}
            </div>
        """
        if has_children:
            html += build_tree_html(sub, current_rel)
        html += "</li>"
    html += "</ul>"
    return html


def generate_folder_tree(folder_path, base_dir):
    rel = os.path.relpath(folder_path, base_dir).replace("\\", "/")
    with open(os.path.join(base_dir, "structure.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
    return build_tree_html(data["root"]["structure"], current_rel=rel)


def generate_index(folder_path, base_dir):
    rel = os.path.relpath(folder_path, base_dir).replace("\\", "/")
    title = "Vault" if rel in (".", "") else f"Index of {rel}"
    dirs, files = [], []
    try:
        for e in os.listdir(folder_path):
            if e.startswith("."):
                continue
            if e.lower() == "index.html":
                continue
            full = os.path.join(folder_path, e)
            (dirs if os.path.isdir(full) else files).append(e)
    except Exception as e:
        print(f"⚠️ Error reading directory {folder_path}: {e}")
    dirs.sort(key=str.lower)
    files.sort(key=str.lower)

    root_rel = os.path.relpath(base_dir, folder_path).replace("\\", "/")
    icons = load_icons()

    try:
        with open(os.path.join(base_dir, "structure.json"), "r", encoding="utf-8") as f:
            data = json.load(f)
        file_count = data["root"]["file_count"]
    except Exception:
        file_count = 0

    max_files = CONFIG["max_files"]
    percentage = (file_count / max_files) * 100 if max_files > 0 else 0

    total_size, current_dir_file_count = get_folder_size(folder_path)
    current_dir_name = os.path.basename(folder_path) if folder_path != base_dir else "Vault"

    storage_html = f"""
      <div class="side-group storage-card">
        <p><span class="material-symbols-outlined">folder_open</span>{escape(current_dir_name)}</p>
        <p>{format_size(total_size)} ({current_dir_file_count} file{"s" if current_dir_file_count != 1 else ""})</p>
      </div>
    """

    quota_html = f"""
      <div class="side-group quota" aria-label="File limit usage">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong>File Limit</strong>
          <span class="badge">{int(percentage)}% used</span>
        </div>
        <div class="bar" aria-hidden="true">
          <span style="width: {percentage}%;"></span>
        </div>
        <div style="margin-top: 8px; color: var(--muted); font-size: 12px;">
          {file_count} files of {max_files:,}
        </div>
      </div>
    """

    folder_tree = generate_folder_tree(folder_path, base_dir)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{escape(title)} ॥ Vault</title>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
  <link rel="stylesheet" href="{root_rel}/theme.css">
</head>
<body>
  <div class="app" id="app">
    <header class="topbar">
      <a class="brand" href="{root_rel}/index.html" aria-label="Vault">
        <span class="material-symbols-outlined">cloud</span>
        <strong>Vault</strong>
      </a>
      <div class="search">
        <span class="material-symbols-outlined">search</span>
        <input id="q" type="search" placeholder="Search in Vault" aria-label="Search files" />
        <kbd class="shortcut">Ctrl + /</kbd>
      </div>
      <div class="top-actions">
        <button class="btn menu" id="btn-menu" title="Toggle menu" aria-label="Toggle sidebar">
          <span class="material-symbols-outlined">menu</span>
        </button>
        <button class="btn ghost" id="btn-theme" title="Toggle theme" aria-label="Toggle dark mode">
          <span class="material-symbols-outlined" id="theme-icon">dark_mode</span>
        </button>
      </div>
    </header>

    <aside class="sidebar" aria-label="Folders">
      <div class="side-inner">
        {storage_html}
        <div class="side-group">
          <h4>Folders</h4>
          <nav id="folder-tree">
            {folder_tree}
          </nav>
        </div>
        {quota_html}
      </div>
    </aside>

    <main class="main" id="main">
      <div class="toolbar" role="toolbar" aria-label="Sort and actions controls">
        <div class="seg" role="group" aria-label="Sort">
          <button data-sort="name" aria-pressed="true">Name</button>
          <button data-sort="ext" aria-pressed="false">Extension</button>
          <button data-sort="modified" aria-pressed="false">Modified</button>
          <button data-sort="size" aria-pressed="false">Size</button>
        </div>
        <div class="spacer"></div>
        <button class="btn icon-only" id="btn-share" title="Share Folder URL" aria-label="Share folder">
          <span class="material-symbols-outlined">share</span>
        </button>
        <button class="btn icon-only" id="btn-download" title="Download" aria-label="Download folder">
          <span class="material-symbols-outlined">download</span>
        </button>
      </div>

      <ul id="files-view" class="files-view" aria-live="polite">
"""
    for name in dirs:
        full = os.path.join(folder_path, name)
        icon = get_icon(name, True, icons)
        display = name.replace("_", " ")
        size, count = get_folder_size(full)
        size_str = format_size(size)
        mod = format_mtime(os.path.getmtime(full))
        meta = f"{count} item{'s' if count != 1 else ''}, {size_str}"
        html += f"""        <li data-name="{escape(name)}" data-ext="folder" data-size="0" data-modified="{mod}">
          {icon}
          <a href="{escape(name)}/index.html" title="{escape(name)}">{escape(display)}</a>
          <span class="meta">{meta}</span>
          <button class="three-dot" data-file="{escape(name)}" aria-label="Actions for {escape(name)}">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
        </li>
"""
    for name in files:
        full = os.path.join(folder_path, name)
        icon = get_icon(name, False, icons)
        display = name.replace("_", " ")
        size = os.path.getsize(full)
        mod = format_mtime(os.path.getmtime(full))
        ext = Path(name).suffix.lower().lstrip(".") or Path(name).name.lower()
        meta = format_size(size)
        html += f"""        <li data-name="{escape(name)}" data-ext="{ext}" data-size="{size}" data-modified="{mod}">
          {icon}
          <a href="{escape(name)}" title="{escape(name)}">{escape(display)}</a>
          <span class="meta">{meta}</span>
          <button class="three-dot" data-file="{escape(name)}" aria-label="Actions for {escape(name)}">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
        </li>
"""

    html += f"""      </ul>
      <div id="empty-state">
        <span class="material-symbols-outlined">folder_off</span>
        <p>This folder is empty</p>
      </div>
      <footer class="footer">
        <div class="footer-inner">
          <div class="footer-left">
            <div>&copy; Vault 2025</div>
          </div>
          <div class="footer-right">
            <a href="#" aria-label="Twitter"><span class="material-symbols-outlined">public</span></a>
            <a href="#" aria-label="GitHub"><span class="material-symbols-outlined">code</span></a>
            <a href="#" aria-label="LinkedIn"><span class="material-symbols-outlined">work</span></a>
          </div>
        </div>
      </footer>
    </main>

    <div class="modal" id="file-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-content">
        <span class="close-modal" role="button" tabindex="0" aria-label="Close dialog">&times;</span>
        <h2 id="modal-title"></h2>
        <p id="modal-details"></p>
        <div class="modal-actions">
          <button id="modal-share">Share</button>
          <button id="modal-download">Download</button>
          <button id="modal-delete" class="danger">Delete</button>
        </div>
      </div>
    </div>

    <script src="{root_rel}/theme.js"></script>
</body>
</html>"""

    with open(os.path.join(folder_path, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def build_site(base_dir="."):
    total_dirs = sum(1 for root, dirs, _ in os.walk(base_dir)
                     if not root.startswith(os.path.join(base_dir, ".")))
    processed_dirs = 0
    bar_width = 20

    icons = load_icons()
    with open(os.path.join(base_dir, "icon.json"), "w", encoding="utf-8") as f:
        json.dump(icons, f, indent=2)

    print("❯ Generating structure.json...")
    write_structure_json(base_dir)
    print("✔ structure.json generated")

    print("❯ Generating index.html files...")
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        generate_index(root, base_dir)
        processed_dirs += 1
        progress = processed_dirs / total_dirs if total_dirs > 0 else 1
        filled = int(bar_width * progress)
        bar = "=" * filled + "-" * (bar_width - filled)
        percentage = int(progress * 100)
        sys.stdout.write(f"\r❯ [{bar}] {percentage}% ({processed_dirs}/{total_dirs})")
        sys.stdout.flush()

    sys.stdout.write("\r" + " " * (bar_width + 20))
    sys.stdout.flush()
    print(f"\r✔ Generated {processed_dirs} index.html files and structure.json")
    print(f"\r✔✔ Site Generated Successfully")
    print(f"\n  Start server:  python3 -m http.server {CONFIG['server_port']}\n")


if __name__ == "__main__":
    build_site()
