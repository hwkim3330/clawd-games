#!/usr/bin/env bash
# Publish the arcade as a static Hugging Face Space. Needs a write token: HF_TOKEN=hf_... tools/deploy-hf.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SPACE="${SPACE:-kimhyunwoo/clawd-games}"
python3 - "$SPACE" <<'PY'
import sys
from huggingface_hub import HfApi
space = sys.argv[1]
api = HfApi()
api.create_repo(space, repo_type="space", space_sdk="static", exist_ok=True)
api.upload_folder(folder_path=".", repo_id=space, repo_type="space",
                  ignore_patterns=[".git/*", "tools/*", "*.py", "video/node_modules/*", "video/out/*", "video/assets/*"], commit_message="Deploy Clawd Arcade")
print(f"https://huggingface.co/spaces/{space}")
PY
