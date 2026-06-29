#!/usr/bin/env python3
import os
import sys
import subprocess
import json
import time

BASE = "https://example.directory.site"
STRUCTURE_URL = f"{BASE}/structure.json"

# --- Auto-install dependencies ---
def ensure_package(pkg, import_name=None):
    name = import_name or pkg
    try:
        __import__(name)
    except ImportError:
        print(f"📦 Installing missing dependency: {pkg}")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
        __import__(name)

ensure_package("requests")
import requests

# --- Globals ---
downloaded_files = 0
downloaded_bytes = 0

# --- Utilities ---
def human_size(n):
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    step = 1024.0
    i = 0
    while n >= step and i < len(units) - 1:
        n /= step
        i += 1
    return f"{n:.1f}{units[i]}"

def download_file(file_url, local_path, size_bytes=None):
    global downloaded_files, downloaded_bytes
    if os.path.exists(local_path):
        print(f"⏭  Skipping existing file: {local_path}")
        return
    os.makedirs(os.path.dirname(local_path) or ".", exist_ok=True)
    try:
        with requests.get(file_url, stream=True, timeout=30) as r:
            r.raise_for_status()
            with open(local_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
        downloaded_files += 1
        if size_bytes:
            downloaded_bytes += size_bytes
        else:
            try:
                downloaded_bytes += os.path.getsize(local_path)
            except:
                pass
        size_info = f" ({human_size(size_bytes)})" if size_bytes else ""
        print(f"⬇  {local_path}{size_info}")
    except requests.RequestException as e:
        print(f"❌ Failed to download {file_url}: {e}")

def walk_structure(base_path, struct, label=None):
    """Download files and subdirs recursively."""
    files_list = struct.get("files", [])
    total_bytes = struct.get("size", sum(f.get("size", 0) for f in files_list))
    files_info = f"{struct.get('file_count', len(files_list))} file(s)"
    size_info = human_size(total_bytes)

    if label:
        print(f"\n📂 Entering {label} — {files_info}, {size_info}\n")

    # Download files
    for f in files_list:
        local_path = f.get("path") or f.get("name")
        if base_path:
            local_path = os.path.join(base_path, os.path.basename(local_path))
        fsize = f.get("size")
        file_url = f"{BASE}/{local_path}"
        download_file(file_url, local_path, fsize)

    # Recurse into subdirs
    for sub_name, sub_info in struct.get("subdirs", {}).items():
        sub_base = os.path.join(base_path, sub_name) if base_path else sub_name
        walk_structure(sub_base, sub_info, label=sub_info.get("label", sub_name))

# --- Tree Printer ---
def print_tree(struct, prefix="", parent=""):
    """Print directory-only tree with ASCII arrows and colored stats."""
    subdirs = list(struct.get("subdirs", {}).items())
    for i, (sub_name, sub_info) in enumerate(subdirs):
        is_last = (i == len(subdirs) - 1)
        branch = "└── " if is_last else "├── "

        size_human = f"\033[36m{human_size(sub_info.get('size', 0))}\033[0m"
        count = f"\033[33m{sub_info.get('file_count', 0)} file(s)\033[0m"
        full_path = os.path.join(parent, sub_name) if parent else sub_name

        print(f"{prefix}{branch}📂 {full_path}/  [{count}, {size_human}]")

        # Extend prefix for children
        extension = "    " if is_last else "│   "
        print_tree(sub_info, prefix + extension, full_path)

# --- Main ---
def main():
    global downloaded_files, downloaded_bytes
    try:
        struct = requests.get(STRUCTURE_URL, timeout=15).json()
    except Exception as e:
        print(f"❌ Failed to fetch structure.json: {e}")
        sys.exit(1)

    root = struct.get("root", {})
    root_struct = root.get("structure", {})

    print("\n   Available Assets in Archive:\n")
    size_h = f"\033[36m{human_size(root.get('size', 0))}\033[0m"
    count_h = f"\033[33m{root.get('file_count', '?')} file(s)\033[0m"
    print(f"📂 {root.get('label','root')}/  [{count_h}, {size_h}]")
    print_tree(root_struct)

    target = input("\nType the directory path from the above tree to download (or 'root' for entire archive): ").strip("/")

    start_time = time.time()

    if target == "root":
        walk_structure("", root_struct, label=root.get("label", "root"))
    else:
        # Navigate to the selected subdir
        parts = target.split("/")
        current = root_struct
        for p in parts:
            if p in current.get("subdirs", {}):
                current = current["subdirs"][p]
            else:
                print(f"❌ '{target}' is not a valid directory")
                sys.exit(1)

        # Print confirmation with ✔ at end
        print("\n✔ Selected target:")
        print(f"📂 {target}/  [\033[33m{current.get('file_count','?')} file(s)\033[0m, \033[36m{human_size(current.get('size',0))}\033[0m] ✔")

        walk_structure(target, current, label=target)

    elapsed = time.time() - start_time
    print("\n☸︎ Done. Everything downloaded!")
    print(f"📊 Stats: {downloaded_files} files, {human_size(downloaded_bytes)} downloaded in {elapsed:.2f} seconds")

if __name__ == "__main__":
    main()