# -*- coding: utf-8 -*-
"""BUSOS-R2-SCS-INTEGRATION-01 bridge — run the REAL frozen Service Agent.

Why this file exists
--------------------
BUSOS is TypeScript; the frozen Service Agent is Python + LangGraph (repo
``Catcherog/service-agent``, FREEZE_SHA ``ebb85686``). This script is the minimal
cross-boundary step: it calls the agent's **real** production LangGraph graph
(``build_graph`` + ``compiled.invoke``, exactly what ``api_server.py`` does for
``/api/agent/chat``) and prints a structured JSON result that the TypeScript
``ServiceAgentPort`` adapter then maps into BUSOS.

Scope discipline
----------------
- Read-only inference: the agent performs KB retrieval + reply generation only;
  no Feishu write, no persistence write, no external side effect. The script
  writes nothing except JSON to stdout.
- It imports the agent's own modules from the frozen SHA working copy
  (``--agent-src``). It is NOT a re-implementation of the agent.
- LLM is injected from the agent's real ``LLMClient``. When the LLM backend is
  unreachable, N05 fails closed (canonical answer / DEFAULT_RESPONSE +
  handoff flags) — the result is still the agent's real, structured output.
- KB is the agent's real ``KnowledgeBase`` (ChromaDB + local embedding model).
  ``VECTOR_STORE_DIR`` / ``EMBEDDING_MODEL_PATH`` default to the agent's own
  config; a caller may override them via env (see --help).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional


def _configure_utf8_stdout() -> None:
    """Keep structured JSON Unicode-safe on Windows console defaults."""
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="strict")


def _extract_structured(state: Dict[str, Any], latency_ms: int) -> Dict[str, Any]:
    """Map the agent's internal AgentState into the port's structured result.

    Field provenance follows src/schema.ts: BUSOS consumes these exact keys.
    The agent's own taxonomy (I00..I12 / R0..R3 / KB_PATH|HUMAN_PATH) is passed
    through untouched — BUSOS maps, never re-derives (AC-05).
    """
    # Retrieval evidence (AC-06): source refs come from source_refs (with
    # content-stripped results), source modules from source_modules.
    source_refs: List[Dict[str, Any]] = list(state.get("source_refs") or [])

    return {
        # --- answer (AC-04) ---
        "answer": state.get("suggested_reply", "") or "",
        # --- structured state (AC-05) ---
        "intent": state.get("intent", "") or "",
        "risk": state.get("risk_level", "") or "",
        "route": state.get("route_path", "") or "",
        # --- handoff status ---
        "handoff": {
            "mustHandoff": bool(state.get("must_handoff", False)),
            "needsClarification": bool(state.get("needs_clarification", False)),
            "answerRequiresDisclaimer": bool(
                state.get("answer_requires_disclaimer", False)
            ),
            "needsHumanConfirm": bool(state.get("needs_human_confirm", False)),
        },
        # --- retrieval evidence / source refs (AC-06) ---
        "evidence": {
            "sourceModules": list(state.get("source_modules") or []),
            "sourceRefs": source_refs,
            "retrievalScore": float(state.get("retrieval_score", 0.0) or 0.0),
            "canonicalAnswerId": state.get("canonical_answer_id"),
            "sourceBlockId": state.get("source_block_id"),
            "hasRetrievalEvidence": bool(
                state.get("has_retrieval_evidence", False)
            ),
        },
        # --- run / trace metadata (AC-08) ---
        "trace": {
            "runId": state.get("run_id", "") or "",
            "requestId": state.get("request_id", "") or "",
            "conversationId": state.get("conversation_id", "") or "",
            "latencyMs": latency_ms,
            "modelName": state.get("model_name"),
            "llmUsed": bool(state.get("llm_used", False)),
            "promptVersion": state.get("prompt_version", "") or "",
        },
    }


def run(
    query: str,
    agent_src: str,
    conversation_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    conversation: Optional[List[Dict[str, str]]] = None,
    top_k: Optional[int] = None,
) -> Dict[str, Any]:
    """Run the frozen agent's real LangGraph graph once, synchronously."""
    if agent_src not in sys.path:
        sys.path.insert(0, agent_src)

    # Import the agent's own modules (frozen SHA working copy).
    # Mirrors src/api_server.py /api/agent/chat: build_graph + invoke.
    from knowledge_base import KnowledgeBase  # noqa: PLC0415
    from llm_client import LLMClient  # noqa: PLC0415
    from langgraph.graph import build_graph  # noqa: PLC0415
    from langgraph.types.state import create_initial_state  # noqa: PLC0415

    kb = KnowledgeBase()
    llm_client = LLMClient()

    compiled = build_graph(kb=kb, llm_client=llm_client)

    kwargs: Dict[str, Any] = {}
    if conversation_id:
        kwargs["conversation_id"] = conversation_id
    if customer_id:
        kwargs["customer_id"] = customer_id
    if conversation:
        # bounded untrusted context (W48): agent filters injection itself
        kwargs["conversation_history"] = conversation
    if top_k:
        kwargs["top_k"] = top_k
    kwargs["channel"] = "api"

    start = time.monotonic()
    initial_state = create_initial_state(query, **kwargs)
    result_state = compiled.invoke(initial_state)
    latency_ms = int((time.monotonic() - start) * 1000)

    # Map internal state -> structured port result (same keys as src/schema.ts).
    return _extract_structured(result_state, latency_ms)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the frozen Service Agent and emit structured JSON.",
    )
    parser.add_argument("--query", required=True, help="Customer message.")
    parser.add_argument(
        "--agent-src",
        default=os.environ.get("BUSOS_SERVICE_AGENT_SRC"),
        help=(
            "Absolute path to the Service Agent 'src' directory. "
            "Defaults to $BUSOS_SERVICE_AGENT_SRC."
        ),
    )
    parser.add_argument("--conversation-id", default=None)
    parser.add_argument("--customer-id", default=None)
    parser.add_argument("--top-k", type=int, default=None)
    parser.add_argument(
        "--conversation",
        default=None,
        help='JSON array of {"role","content"} turns.',
    )
    args = parser.parse_args(argv)

    agent_src = args.agent_src
    if not agent_src:
        print(
            "BUSOS_SERVICE_AGENT_SRC is not set and --agent-src was not given.",
            file=sys.stderr,
        )
        return 2
    if not os.path.isdir(agent_src):
        print(f"Service Agent src not found: {agent_src}", file=sys.stderr)
        return 2

    conversation = None
    if args.conversation:
        try:
            conversation = json.loads(args.conversation)
        except json.JSONDecodeError as e:
            print(f"--conversation must be valid JSON: {e}", file=sys.stderr)
            return 2

    try:
        result = run(
            query=args.query,
            agent_src=agent_src,
            conversation_id=args.conversation_id,
            customer_id=args.customer_id,
            conversation=conversation,
            top_k=args.top_k,
        )
    except Exception as e:  # agent-level fault -> structured failure on stderr
        print(f"AGENT_RUN_FAILED: {type(e).__name__}: {e}", file=sys.stderr)
        return 1

    _configure_utf8_stdout()
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
