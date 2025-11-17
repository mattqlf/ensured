from __future__ import annotations

import json
from pathlib import Path
from dotenv import load_dotenv

from langchain.chat_models import init_chat_model
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
load_dotenv()

PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "test_prompt_v2.txt"


def _load_system_prompt() -> str:
    """Return the system prompt for the test creator agent, read from a text file."""
    return PROMPT_PATH.read_text(encoding="utf-8").strip()

TEST_CASES_FILENAME = "test_cases.json"
TEST_CASES_OUTPUT_PATH = Path(__file__).resolve().parent / TEST_CASES_FILENAME

model = init_chat_model("gemini-2.5-pro", model_provider="google_genai", temperature=1.0, thinking_budget=8192)

test_creator_agent = create_deep_agent(
    model=model,
    backend=FilesystemBackend(root_dir="./tests", virtual_mode=True),
    system_prompt=_load_system_prompt(),
)

def generate_test_cases() -> Path:
    """Run the test_creator_agent once and persist test_cases.json to disk.

    Returns the path to the written JSON file.
    """
    # Ask the agent to generate the test_cases.json file using its tools.
    result = test_creator_agent.invoke(
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

    TEST_CASES_OUTPUT_PATH.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    return TEST_CASES_OUTPUT_PATH


if __name__ == "__main__":
    path = generate_test_cases()
    print(f"Wrote test cases to {path}")
