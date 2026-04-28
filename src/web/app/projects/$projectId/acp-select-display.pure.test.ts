import { describe, expect, test } from "vitest";

import {
  formatAcpSelectOptionLabel,
  formatAcpSelectOptionInfo,
  formatAcpSelectValueLabel,
  formatAcpSelectValueInfo,
  parseBracketAttributes,
} from "./acp-select-display.pure.ts";

describe("formatAcpSelectValueLabel", () => {
  test("Copilot mode は URL id ではなく name を表示する", () => {
    const modes = [
      {
        id: "https://agentclientprotocol.com/protocol/session-modes#agent",
        name: "Agent",
        description: null,
      },
      {
        id: "https://agentclientprotocol.com/protocol/session-modes#plan",
        name: "Plan",
        description: null,
      },
    ];

    expect(
      formatAcpSelectValueLabel({
        fallback: "Mode",
        kind: "mode",
        options: modes,
        presetId: "copilot-cli",
        value: "https://agentclientprotocol.com/protocol/session-modes#agent",
      }),
    ).toBe("Agent");
  });

  test("Cursor model は候補と選択後の label に name だけを出す", () => {
    const model = {
      id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
      name: "gpt-5.5",
      description: null,
    };
    const models = [model];

    expect(
      formatAcpSelectOptionLabel({
        kind: "model",
        option: model,
        options: models,
        presetId: "cursor-cli",
      }),
    ).toBe("gpt-5.5");
    expect(
      formatAcpSelectValueLabel({
        fallback: "Model",
        kind: "model",
        options: models,
        presetId: "cursor-cli",
        value: model.id,
      }),
    ).toBe("gpt-5.5");
  });

  test("Cursor model の bracket 属性は info text として取り出す", () => {
    const model = {
      id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
      name: "gpt-5.5",
      description: null,
    };

    expect(
      formatAcpSelectOptionInfo({
        kind: "model",
        option: model,
        presetId: "cursor-cli",
      }),
    ).toBe("context=272k\nreasoning=medium\nfast=false");
  });

  test("Cursor model の選択値から bracket 属性 info を取り出す", () => {
    const model = {
      id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
      name: "gpt-5.5",
      description: null,
    };

    expect(
      formatAcpSelectValueInfo({
        kind: "model",
        options: [model],
        presetId: "cursor-cli",
        value: model.id,
      }),
    ).toBe("context=272k\nreasoning=medium\nfast=false");
  });

  test("bracket 属性を key=value として parse する", () => {
    expect([
      ...parseBracketAttributes("composer2[context=272k,reasoning=medium]").entries(),
    ]).toEqual([
      ["context", "272k"],
      ["reasoning", "medium"],
    ]);
  });

  test("同名 option は id を併記して区別できるようにする", () => {
    const target = { id: "b/two", name: "same", description: null };
    const models = [{ id: "a/one", name: "same", description: null }, target];

    expect(
      formatAcpSelectOptionLabel({
        kind: "model",
        option: target,
        options: models,
        presetId: "pi-coding-agent",
      }),
    ).toBe("same · b/two");
  });
});
