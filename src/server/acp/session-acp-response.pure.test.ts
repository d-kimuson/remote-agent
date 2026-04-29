import type { NewSessionResponse } from '@agentclientprotocol/sdk';

import { describe, expect, test } from 'vitest';

import {
  buildGenericConfigOptionsFromResponse,
  buildModelOptionsFromResponse,
  buildModeOptionsFromResponse,
} from './session-acp-response.pure';

describe('buildModelOptionsFromResponse', () => {
  test('prefers experimental models state when non-empty', () => {
    const r = {
      sessionId: 's1',
      models: {
        availableModels: [{ modelId: 'm1', name: 'One' }],
        currentModelId: 'm1',
      },
    };
    const out = buildModelOptionsFromResponse(r as NewSessionResponse);
    expect(out.options).toEqual([{ id: 'm1', name: 'One', description: null }]);
    expect(out.currentModelId).toBe('m1');
  });

  test('reads model list from configOptions when models state is empty', () => {
    const r = {
      sessionId: 's1',
      models: null,
      configOptions: [
        {
          type: 'select' as const,
          id: 'model',
          name: 'Model',
          category: 'model' as const,
          currentValue: 'gpt-5',
          options: [
            { value: 'gpt-5', name: 'GPT-5' },
            { value: 'gpt-5-mini', name: 'GPT-5 mini' },
          ],
        },
      ],
    };
    const out = buildModelOptionsFromResponse(r as NewSessionResponse);
    expect(out.options).toEqual([
      { id: 'gpt-5', name: 'GPT-5', description: null },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', description: null },
    ]);
    expect(out.currentModelId).toBe('gpt-5');
  });
});

describe('buildModeOptionsFromResponse', () => {
  test('reads mode list from configOptions when modes state is empty', () => {
    const r = {
      sessionId: 's1',
      modes: null,
      configOptions: [
        {
          type: 'select' as const,
          id: 'mode',
          name: 'Mode',
          category: 'mode' as const,
          currentValue: 'plan',
          options: [
            { value: 'ask', name: 'Ask' },
            { value: 'plan', name: 'Plan' },
          ],
        },
      ],
    };
    const out = buildModeOptionsFromResponse(r as NewSessionResponse);
    expect(out.options).toEqual([
      { id: 'ask', name: 'Ask', description: null },
      { id: 'plan', name: 'Plan', description: null },
    ]);
    expect(out.currentModeId).toBe('plan');
  });
});

describe('buildGenericConfigOptionsFromResponse', () => {
  test('maps select config options except model and mode options', () => {
    const r: Pick<NewSessionResponse, 'configOptions'> = {
      configOptions: [
        {
          type: 'select' as const,
          id: 'model',
          name: 'Model',
          category: 'model' as const,
          currentValue: 'gpt-5',
          options: [{ value: 'gpt-5', name: 'GPT-5' }],
        },
        {
          type: 'select' as const,
          id: 'mode',
          name: 'Mode',
          category: 'mode' as const,
          currentValue: 'plan',
          options: [{ value: 'plan', name: 'Plan' }],
        },
        {
          type: 'select' as const,
          id: 'verbosity',
          name: 'Verbosity',
          category: 'response' as const,
          description: 'Response detail',
          currentValue: 'medium',
          options: [
            { value: 'low', name: 'Low', description: 'Short answers' },
            { value: 'medium', name: 'Medium' },
          ],
        },
      ],
    };
    const out = buildGenericConfigOptionsFromResponse(r);
    expect(out).toEqual([
      {
        id: 'verbosity',
        name: 'Verbosity',
        category: 'response',
        description: 'Response detail',
        currentValue: 'medium',
        values: [
          { value: 'low', name: 'Low', description: 'Short answers' },
          { value: 'medium', name: 'Medium', description: null },
        ],
      },
    ]);
  });

  test('flattens grouped select config options', () => {
    const r: Pick<NewSessionResponse, 'configOptions'> = {
      configOptions: [
        {
          type: 'select' as const,
          id: 'reasoning-effort',
          name: 'Reasoning',
          currentValue: 'high',
          options: [
            {
              group: 'effort',
              name: 'Effort',
              options: [
                { value: 'medium', name: 'Medium' },
                { value: 'high', name: 'High' },
              ],
            },
          ],
        },
      ],
    };
    const out = buildGenericConfigOptionsFromResponse(r);
    expect(out).toEqual([
      {
        id: 'reasoning-effort',
        name: 'Reasoning',
        category: null,
        description: null,
        currentValue: 'high',
        values: [
          { value: 'medium', name: 'Medium', description: null },
          { value: 'high', name: 'High', description: null },
        ],
      },
    ]);
  });
});
