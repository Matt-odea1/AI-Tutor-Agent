#!/usr/bin/env python3
from pathlib import Path
import runpy


if __name__ == "__main__":
    script_path = Path(__file__).resolve().parent / "test_scripts" / "upload_db_context_batch.py"
    if not script_path.exists():
        raise FileNotFoundError(f"Cannot find uploader script at: {script_path}")
    runpy.run_path(str(script_path), run_name="__main__")
