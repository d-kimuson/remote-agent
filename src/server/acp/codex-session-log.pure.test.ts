import { describe, expect, test } from "vitest";

import {
  parseClaudeCodeSessionLogText,
  parseCodexSessionLogText,
  parsePiCodingAgentSessionLogText,
} from "./codex-session-log.pure.ts";

const line = (value: unknown): string => JSON.stringify(value);

describe("parseCodexSessionLogText", () => {
  test("converts Codex JSONL response items into chat messages", () => {
    const text = [
      line({
        timestamp: "2026-04-27T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "codex-session-1",
          cwd: "/repo",
          timestamp: "2026-04-27T10:00:00.000Z",
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "# AGENTS.md instructions for /repo\n\n<INSTRUCTIONS>\n# Repository\n</INSTRUCTIONS>",
            },
          ],
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:01.500Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "<environment_context>\n  <cwd>/repo</cwd>\n  <shell>zsh</shell>\n</environment_context>",
            },
          ],
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:01.750Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:02.000Z",
        type: "response_item",
        payload: {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "thinking" }],
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:03.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call-1",
          name: "shell_command",
          arguments: '{"cmd":"pwd"}',
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:04.000Z",
        type: "event_msg",
        payload: {
          type: "exec_command_end",
          call_id: "call-1",
          process_id: "123",
          turn_id: "turn-1",
          command: ["/bin/zsh", "-lc", "pwd"],
          cwd: "/repo",
          parsed_cmd: [{ type: "unknown", cmd: "pwd" }],
          source: "unified_exec_startup",
          stdout: "/repo\n",
          stderr: "",
          aggregated_output: "/repo\n",
          exit_code: 0,
          duration: { secs: 0, nanos: 5090 },
          formatted_output: "/repo\n",
          status: "completed",
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:04.500Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call-1",
          output: "short text output should be ignored when structured output exists",
        },
      }),
      line({
        timestamp: "2026-04-27T10:00:05.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "done" }],
        },
      }),
    ].join("\n");

    const imported = parseCodexSessionLogText(text, "fallback-session");

    expect(imported.meta).toEqual({
      sessionId: "codex-session-1",
      cwd: "/repo",
      createdAt: "2026-04-27T10:00:00.000Z",
      updatedAt: "2026-04-27T10:00:05.000Z",
    });
    expect(imported.messages.map((message) => [message.role, message.kind, message.text])).toEqual([
      ["user", "user", "hello"],
      ["assistant", "reasoning", "thinking"],
      ["assistant", "tool_call", '{\n  "cmd": "pwd"\n}'],
      [
        "assistant",
        "tool_result",
        JSON.stringify(
          {
            type: "exec_command_end",
            call_id: "call-1",
            process_id: "123",
            turn_id: "turn-1",
            command: ["/bin/zsh", "-lc", "pwd"],
            cwd: "/repo",
            parsed_cmd: [{ type: "unknown", cmd: "pwd" }],
            source: "unified_exec_startup",
            stdout: "/repo\n",
            stderr: "",
            aggregated_output: "/repo\n",
            exit_code: 0,
            duration: { secs: 0, nanos: 5090 },
            formatted_output: "/repo\n",
            status: "completed",
          },
          null,
          2,
        ),
      ],
      ["assistant", "assistant_text", "done"],
    ]);
    expect(imported.messages[2]?.rawEvents).toEqual([
      {
        type: "toolCall",
        toolCallId: "call-1",
        toolName: "shell_command",
        inputText: '{\n  "cmd": "pwd"\n}',
        rawText: '{\n  "cmd": "pwd"\n}',
      },
    ]);
    expect(imported.messages[3]?.rawEvents).toEqual([
      {
        type: "toolResult",
        toolCallId: "call-1",
        toolName: "exec_command",
        outputText: JSON.stringify(
          {
            type: "exec_command_end",
            call_id: "call-1",
            process_id: "123",
            turn_id: "turn-1",
            command: ["/bin/zsh", "-lc", "pwd"],
            cwd: "/repo",
            parsed_cmd: [{ type: "unknown", cmd: "pwd" }],
            source: "unified_exec_startup",
            stdout: "/repo\n",
            stderr: "",
            aggregated_output: "/repo\n",
            exit_code: 0,
            duration: { secs: 0, nanos: 5090 },
            formatted_output: "/repo\n",
            status: "completed",
          },
          null,
          2,
        ),
        rawText: JSON.stringify(
          {
            type: "exec_command_end",
            call_id: "call-1",
            process_id: "123",
            turn_id: "turn-1",
            command: ["/bin/zsh", "-lc", "pwd"],
            cwd: "/repo",
            parsed_cmd: [{ type: "unknown", cmd: "pwd" }],
            source: "unified_exec_startup",
            stdout: "/repo\n",
            stderr: "",
            aggregated_output: "/repo\n",
            exit_code: 0,
            duration: { secs: 0, nanos: 5090 },
            formatted_output: "/repo\n",
            status: "completed",
          },
          null,
          2,
        ),
      },
    ]);
  });
});

describe("parseClaudeCodeSessionLogText", () => {
  test("converts Claude Code project JSONL messages and tool results", () => {
    const text = [
      line({
        type: "user",
        uuid: "user-1",
        sessionId: "claude-session-1",
        timestamp: "2026-04-27T10:00:00.000Z",
        cwd: "/repo",
        message: { role: "user", content: "実装してください" },
      }),
      line({
        type: "assistant",
        uuid: "assistant-1",
        sessionId: "claude-session-1",
        timestamp: "2026-04-27T10:00:01.000Z",
        cwd: "/repo",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "調査します", signature: "encrypted" },
            { type: "text", text: "確認します。" },
            {
              type: "tool_use",
              id: "toolu_1",
              name: "Bash",
              input: { command: "pwd" },
            },
          ],
        },
      }),
      line({
        type: "user",
        uuid: "tool-result-1",
        sessionId: "claude-session-1",
        timestamp: "2026-04-27T10:00:02.000Z",
        cwd: "/repo",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "/repo\n" }],
        },
      }),
    ].join("\n");

    const imported = parseClaudeCodeSessionLogText(text, "fallback-session");

    expect(imported.meta).toEqual({
      sessionId: "claude-session-1",
      cwd: "/repo",
      createdAt: "2026-04-27T10:00:00.000Z",
      updatedAt: "2026-04-27T10:00:02.000Z",
    });
    expect(imported.messages.map((message) => [message.role, message.kind, message.text])).toEqual([
      ["user", "user", "実装してください"],
      ["assistant", "reasoning", "調査します"],
      ["assistant", "assistant_text", "確認します。"],
      ["assistant", "tool_call", '{\n  "command": "pwd"\n}'],
      ["assistant", "tool_result", "/repo\n"],
    ]);
    expect(imported.messages[3]?.rawEvents).toEqual([
      {
        type: "toolCall",
        toolCallId: "toolu_1",
        toolName: "Bash",
        inputText: '{\n  "command": "pwd"\n}',
        rawText: '{\n  "command": "pwd"\n}',
      },
    ]);
  });
});

describe("parsePiCodingAgentSessionLogText", () => {
  test("converts pi-coding-agent session JSONL messages and tool results", () => {
    const text = [
      line({
        type: "session",
        version: 3,
        id: "pi-session-1",
        timestamp: "2026-04-27T10:00:00.000Z",
        cwd: "/repo",
      }),
      line({
        type: "message",
        id: "msg-user",
        timestamp: "2026-04-27T10:00:01.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "セットアップしてください" }],
        },
      }),
      line({
        type: "message",
        id: "msg-assistant",
        timestamp: "2026-04-27T10:00:02.000Z",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "リポジトリを確認します" },
            {
              type: "toolCall",
              id: "call-1",
              name: "bash",
              arguments: { command: "ls -la" },
            },
          ],
        },
      }),
      line({
        type: "message",
        id: "msg-tool-result",
        timestamp: "2026-04-27T10:00:03.000Z",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "bash",
          content: [{ type: "text", text: "合計 8\n" }],
          isError: false,
        },
      }),
    ].join("\n");

    const imported = parsePiCodingAgentSessionLogText(text, "fallback-session");

    expect(imported.meta).toEqual({
      sessionId: "pi-session-1",
      cwd: "/repo",
      createdAt: "2026-04-27T10:00:00.000Z",
      updatedAt: "2026-04-27T10:00:03.000Z",
    });
    expect(imported.messages.map((message) => [message.role, message.kind, message.text])).toEqual([
      ["user", "user", "セットアップしてください"],
      ["assistant", "reasoning", "リポジトリを確認します"],
      ["assistant", "tool_call", '{\n  "command": "ls -la"\n}'],
      ["assistant", "tool_result", "合計 8\n"],
    ]);
    expect(imported.messages[2]?.rawEvents).toEqual([
      {
        type: "toolCall",
        toolCallId: "call-1",
        toolName: "bash",
        inputText: '{\n  "command": "ls -la"\n}',
        rawText: '{\n  "command": "ls -la"\n}',
      },
    ]);
    expect(imported.messages[3]?.rawEvents).toEqual([
      {
        type: "toolResult",
        toolCallId: "call-1",
        toolName: "bash",
        outputText: "合計 8\n",
        rawText: "合計 8\n",
      },
    ]);
  });
});
