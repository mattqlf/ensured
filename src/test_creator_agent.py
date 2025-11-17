from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend

load_dotenv()

ROOT_DIR = Path(__file__).resolve().parents[1]

# Prompts live at the project root alongside src/.
PROMPT_PATH = ROOT_DIR / "prompts" / "test_prompt_v2.txt"


def _load_system_prompt() -> str:
    """Return the system prompt for the test creator agent, read from a text file."""
    return PROMPT_PATH.read_text(encoding="utf-8").strip()


TEST_CASES_FILENAME = "test_cases.json"

model = init_chat_model(
    "gemini-2.5-pro",
    model_provider="google_genai",
    temperature=1.0,
    thinking_budget=8192,
)


def create_test_creator_agent(root_dir: Path):
    """Create a deep agent configured to operate within the given root directory."""
    backend = FilesystemBackend(root_dir=str(root_dir), virtual_mode=True)
    return create_deep_agent(
        model=model,
        backend=backend,
        system_prompt=_load_system_prompt(),
    )


def generate_test_cases(root_dir: Path, output_path: Optional[Path] = None) -> Path:
    """Run the test_creator_agent once and persist test_cases.json to disk.

    Returns the path to the written JSON file.
    """
    agent = create_test_creator_agent(root_dir)

    # Ask the agent to generate the test_cases.json file using its tools.
    result = agent.invoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Use your filesystem tools to inspect the repository and "
                        "then create the test_cases.json file as described in your "
                        "system prompt. When you are done, ensure the file "
                        "test_cases.json exists and contains the final JSON array "
                        "of test cases."
                    ),
                }
            ]
        }
    )

    # If the agent used write_file, deepagents will surface the file
    # contents in the `files` field of the final state.
    files = result.get("files", {}) or {}
    content = files.get(TEST_CASES_FILENAME)

    # Fallback: if the agent did not use write_file, assume that the last
    # message content is the JSON payload.
    if not content:
        messages = result.get("messages") or []
        if not messages:
            raise RuntimeError("Agent finished without producing any messages or files.")
        final_msg = messages[-1]
        # deepagents returns message objects with a `.content` attribute
        # that holds the raw text.
        content = getattr(final_msg, "content", None)

    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Agent did not produce JSON content for test_cases.json.")

    # Validate that the content is valid JSON and matches the expected shape.
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Agent output is not valid JSON: {e}") from e

    if not isinstance(parsed, list):
        raise RuntimeError("test_cases.json must contain a JSON array.")

    for i, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise RuntimeError(f"Test case at index {i} is not an object.")
        if set(item.keys()) != {"starting_url", "task_prompt"}:
            raise RuntimeError(
                f"Test case at index {i} must have exactly 'starting_url' and 'task_prompt' keys."
            )

    if output_path is None:
        # By default, write test_cases.json into the agent's root directory.
        output_path = root_dir / TEST_CASES_FILENAME

    output_path.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    return output_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate test_cases.json for a target web app directory "
            "using the test creator agent."
        )
    )
    parser.add_argument(
        "--root",
        "--root-dir",
        dest="root_dir",
        default="tests",
        help=(
            "Path (relative to the project root) to the directory the agent "
            "should analyze (e.g. 'tests' or 'realistic-test'). "
            "Default: 'tests'."
        ),
    )
    parser.add_argument(
        "--output",
        dest="output_path",
        default=None,
        help=(
            "Optional path (relative to the project root or absolute) for the "
            "generated test_cases.json. "
            "Default: <root_dir>/test_cases.json."
        ),
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()

    root_dir = Path(args.root_dir)
    if not root_dir.is_absolute():
        root_dir = ROOT_DIR / root_dir

    output_path: Optional[Path]
    if args.output_path is not None:
        output_path = Path(args.output_path)
        if not output_path.is_absolute():
            output_path = ROOT_DIR / output_path
    else:
        output_path = None

    path = generate_test_cases(root_dir=root_dir, output_path=output_path)
    print(f"Wrote test cases to {path}")
