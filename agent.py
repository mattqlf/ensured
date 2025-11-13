from __future__ import annotations
from dotenv import load_dotenv

import base64
import operator
from typing import Literal, Optional, Callable, Awaitable

from typing_extensions import Annotated, TypedDict

from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage, SystemMessage, ToolMessage, HumanMessage
from langgraph.graph import StateGraph, START, END

from playwright.async_api import Page

load_dotenv()

SYSTEM_PROMPT = (
    "You are a browser-using agent. Carefully observe the provided screenshot and "
    "raw HTML, plan concise actions, and use the available tools to interact with "
    "the page. Prefer stable selectors (roles and accessible names). Respond with "
    "tool calls rather than explanations."
)


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int
    task_success: bool


def make_click_tool(page: Page):
    @tool("click")
    async def click(role: str, value: str) -> str:
        """Click an element by ARIA role and accessible name.

        Args:
            role: ARIA role (e.g., 'button', 'link')
            value: Accessible name (e.g., 'Open menu', 'More information...')
        """
        await page.get_by_role(role, name=value).click()
        return f"Clicked role={role} name={value}"

    return click


def make_input_tool(page: Page):
    @tool("input")
    async def input_text(role: str, value: str, text: str) -> str:
        """Type text into an element by ARIA role and accessible name.

        Args:
            role: ARIA role (e.g., 'textbox')
            value: Accessible name (e.g., 'Name')
            text: The text to fill into the element
        """
        await page.get_by_role(role, name=value).fill(text)
        return f"Filled role={role} name={value} with: {text}"

    return input_text


def make_check_tool(page: Page):
    @tool("check")
    async def check(role: str, value: str) -> str:
        """Check a checkbox or select a radio by ARIA role and accessible name.

        Args:
            role: ARIA role (e.g., 'checkbox', 'radio')
            value: Accessible name (e.g., 'I agree')
        """
        await page.get_by_role(role, name=value).check()
        return f"Checked role={role} name={value}"

    return check


def make_filter_click_tool(page: Page):
    @tool("filter_click")
    async def filter_click(container_role: str, filter_text: str, role: str, value: str) -> str:
        """Click an element inside a container filtered by text.

        Args:
            container_role: Container role (e.g., 'listitem', 'row')
            filter_text: Substring to filter containers by (has_text)
            role: Inner element role (e.g., 'button', 'link')
            value: Accessible name of the inner element
        """
        await (
            page.get_by_role(container_role)
            .filter(has_text=filter_text)
            .get_by_role(role, name=value)
            .click()
        )
        return (
            f"Filter-click container_role={container_role} filter_text={filter_text} "
            f"role={role} name={value}"
        )

    return filter_click


def make_filter_input_tool(page: Page):
    @tool("filter_input")
    async def filter_input(
        container_role: str, filter_text: str, role: str, value: str, text: str
    ) -> str:
        """Type text into an element inside a container filtered by text.

        Args:
            container_role: Container role (e.g., 'listitem', 'row')
            filter_text: Substring to filter containers by (has_text)
            role: Inner element role (e.g., 'textbox')
            value: Accessible name of the inner element
            text: The text to fill
        """
        await (
            page.get_by_role(container_role)
            .filter(has_text=filter_text)
            .get_by_role(role, name=value)
            .fill(text)
        )
        return (
            f"Filter-input container_role={container_role} filter_text={filter_text} "
            f"role={role} name={value} text={text}"
        )

    return filter_input


def make_filter_check_tool(page: Page):
    @tool("filter_check")
    async def filter_check(container_role: str, filter_text: str, role: str, value: str) -> str:
        """Check a checkbox/radio inside a container filtered by text.

        Args:
            container_role: Container role (e.g., 'listitem', 'row')
            filter_text: Substring to filter containers by (has_text)
            role: Inner element role (e.g., 'checkbox', 'radio')
            value: Accessible name of the inner element
        """
        await (
            page.get_by_role(container_role)
            .filter(has_text=filter_text)
            .get_by_role(role, name=value)
            .check()
        )
        return (
            f"Filter-check container_role={container_role} filter_text={filter_text} "
            f"role={role} name={value}"
        )

    return filter_check

def make_agent(
    page: Page,
    prompt: Optional[str] = None,
    is_success: Optional[Callable[[Page], Awaitable[bool]]] = None,
):
    """Return a compiled LangGraph agent bound to the given Playwright page.

    Loop per turn:
    1) capture screenshot + HTML
    2) send both to the LLM (multimodal)
    3) execute any tool calls
    4) check success; if not, repeat
    """
    # Do not change: user requires this exact model setup
    model = init_chat_model("gpt-5-mini", temperature=0.8)

    # Require a task prompt (no fallback)
    if prompt is None or not str(prompt).strip():
        raise ValueError("prompt (task_prompt) must be provided for make_agent")

    click_tool = make_click_tool(page)
    input_tool = make_input_tool(page)
    check_tool = make_check_tool(page)
    filter_click_tool = make_filter_click_tool(page)
    filter_input_tool = make_filter_input_tool(page)
    filter_check_tool = make_filter_check_tool(page)
    tools = [
        click_tool,
        input_tool,
        check_tool,
        filter_click_tool,
        filter_input_tool,
        filter_check_tool,
    ]
    tools_by_name = {t.name: t for t in tools}
    model_with_tools = model.bind_tools(tools)

    async def llm_call(state: AgentState):
        # 1) Capture current page state
        png_bytes = await page.screenshot(type="png", full_page=False)
        html = await page.content()
        b64 = base64.b64encode(png_bytes).decode("ascii")

        # 2) Build a multimodal user message (text + image + raw HTML)
        user_msg = HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": (
                        "Here is the current page screenshot and raw HTML. "
                    ),
                },
                {
                    "type": "image",
                    "base64": b64,
                    "mime_type": "image/png",
                },
                {
                    "type": "text",
                    "text": f"RAW_HTML_START\n{html}\nRAW_HTML_END",
                },
            ]
        )

        # 2) Send to LLM (with system prompt + required task prompt + history)
        task_prompt = prompt.strip()
        effective_prompt = f"{SYSTEM_PROMPT}\n\nTask: {task_prompt}"
        ai_msg = await model_with_tools.ainvoke(
            [SystemMessage(content=effective_prompt)] + state["messages"] + [user_msg]
        )

        return {
            # Append both the user message we created and the AI response to state
            "messages": [user_msg, ai_msg],
            "llm_calls": state.get("llm_calls", 0) + 1,
        }

    # Require a success function to be provided
    if is_success is None:
        raise ValueError("is_success must be provided for make_agent")

    async def tool_node(state: AgentState):
        # 3) Execute tool calls
        results = []
        for tool_call in state["messages"][-1].tool_calls:
            t = tools_by_name[tool_call["name"]]
            observation = await t.ainvoke(tool_call["args"])
            results.append(
                ToolMessage(content=str(observation), tool_call_id=tool_call["id"]) 
            )

        # 4) Check success via injected checker only
        success = state.get("task_success", False)
        if not success:
            try:
                success = await is_success(page)
            except Exception:
                success = False

        return {"messages": results, "task_success": success}

    def should_continue_from_llm(state: AgentState) -> Literal["tool_node", END]:
        if state.get("task_success"):
            return END
        last = state["messages"][-1]
        if getattr(last, "tool_calls", None):
            return "tool_node"
        return END

    def should_continue_from_tool(state: AgentState) -> Literal["llm_call", END]:
        if state.get("task_success"):
            return END
        return "llm_call"

    builder = StateGraph(AgentState)
    builder.add_node("llm_call", llm_call)
    builder.add_node("tool_node", tool_node)

    builder.add_edge(START, "llm_call")
    builder.add_conditional_edges("llm_call", should_continue_from_llm, ["tool_node", END])
    builder.add_conditional_edges("tool_node", should_continue_from_tool, ["llm_call", END])

    return builder.compile()


__all__ = ["make_agent", "AgentState", "SYSTEM_PROMPT"]
