# -*- coding: utf-8 -*-
"""BUSOS-P1-02 bridge — real Service Agent consultation context as JSON.

Why this file exists
--------------------
The existing Service Agent is Python + LangGraph (repo ``Catcherog/service-agent``,
working copy ``Monorepo/service agent``). The frozen contracts are
TypeScript + zod (``@busos/contracts``, BUSOS-P1-01). This script is the minimal
cross-boundary step: it calls the agent's **real** production modules and prints
a ``ConsultationContextV1`` payload that the TypeScript Candidate Builder then
turns into a ``LeadCandidateV1``.

It exists so the Candidate Builder consumes genuine agent output. It is not a
re-implementation of the agent, and no stand-in agent is created anywhere.

What it calls
-------------
Exactly what LangGraph node N02 calls (``src/langgraph/nodes/n02_intent_classifier.py``):

- ``langgraph.types.intent.classify_intent``      -> intent, intent_confidence
- ``langgraph.types.state.create_initial_state``  -> run_id, conversation_id, message

Hard boundary (BUSOS-P1-02 gate 8)
----------------------------------
This script is read-only and offline:

- It imports only ``langgraph.types.*``, whose whole subtree imports nothing but
  the standard library (``enum``, ``typing``, ``hashlib``, ``uuid``, ``datetime``).
- It never imports ``api_server``, ``knowledge_base``, ``feishu_blocks``,
  ``persistence`` or any Feishu/lark SDK.
- It performs no network call, opens no socket, and writes no store. It only
  writes JSON to stdout.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

# Modules of the existing Service Agent that this bridge is allowed to touch.
ALLOWED_AGENT_MODULES = (
    "langgraph.types.intent",
    "langgraph.types.state",
)


def _configure_utf8_stdout() -> None:
    """Keep structured JSON Unicode-safe on Windows console defaults."""
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="strict")


def build_context(message: str, agent_src: str) -> dict:
    """Run the agent's real classifier + state factory for one message."""
    if agent_src not in sys.path:
        sys.path.insert(0, agent_src)

    # Imported lazily: the path to the existing agent is only known at runtime.
    from langgraph.types.intent import classify_intent  # noqa: PLC0415
    from langgraph.types.state import create_initial_state  # noqa: PLC0415

    intent_enum, confidence = classify_intent(message)
    state = create_initial_state(message)

    return {
        "conversation_id": state["conversation_id"],
        "run_id": state["run_id"],
        "message": state["message"],
        "intent": intent_enum.value,
        # N02 stores float(confidence); mirror that exactly.
        "intent_confidence": float(confidence),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Emit ConsultationContextV1 JSON from the real Service Agent.",
    )
    parser.add_argument("--message", required=True, help="Consultation message.")
    parser.add_argument(
        "--agent-src",
        default=os.environ.get("BUSOS_SERVICE_AGENT_SRC"),
        help=(
            "Absolute path to the Service Agent 'src' directory. "
            "Defaults to $BUSOS_SERVICE_AGENT_SRC."
        ),
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

    context = build_context(args.message, agent_src)
    _configure_utf8_stdout()
    json.dump(context, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
