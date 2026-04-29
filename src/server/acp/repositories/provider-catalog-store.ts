import { and, eq } from 'drizzle-orm';
import { array, parse, pipe, string, trim } from 'valibot';

import {
  agentPresetSchema,
  agentProviderStatusSchema,
  modeOptionSchema,
  modelOptionSchema,
  type AgentModelCatalogResponse,
  type AgentPreset,
  type AgentProviderCatalogSummary,
  type AgentProviderStatus,
} from '../../../shared/acp.ts';
import {
  agentProviderCatalogsTable,
  customAgentProvidersTable,
  enabledAgentProvidersTable,
} from '../../db/schema.ts';
import { type AppDatabase, getDefaultDatabase } from '../../db/sqlite.ts';
import { parseCommandLine } from '../args.pure.ts';
import { agentPresets } from '../presets.ts';
import { emitAcpSse } from '../services/sse-broadcast.ts';

const customProviderIdPrefix = 'custom:';

const parseCatalog = (
  record: typeof agentProviderCatalogsTable.$inferSelect | undefined,
): AgentModelCatalogResponse | null => {
  if (record === undefined) {
    return null;
  }

  return {
    availableModels: parse(array(modelOptionSchema), JSON.parse(record.availableModelsJson)),
    availableModes: parse(array(modeOptionSchema), JSON.parse(record.availableModesJson)),
    currentModelId: record.currentModelId,
    currentModeId: record.currentModeId,
    lastError: record.lastError,
  };
};

const catalogEquals = (
  left: AgentModelCatalogResponse | null,
  right: AgentModelCatalogResponse,
): boolean =>
  left !== null &&
  left.currentModelId === right.currentModelId &&
  left.currentModeId === right.currentModeId &&
  left.lastError === right.lastError &&
  JSON.stringify(left.availableModels) === JSON.stringify(right.availableModels) &&
  JSON.stringify(left.availableModes) === JSON.stringify(right.availableModes);

const catalogSummaryFrom = (
  record: typeof agentProviderCatalogsTable.$inferSelect | undefined,
): AgentProviderCatalogSummary | null => {
  if (record === undefined) {
    return null;
  }

  const catalog = parseCatalog(record);
  if (catalog === null) {
    return null;
  }

  return {
    availableModelCount: catalog.availableModels.length,
    availableModeCount: catalog.availableModes.length,
    currentModelId: catalog.currentModelId,
    currentModeId: catalog.currentModeId,
    lastError: catalog.lastError,
    refreshedAt: record.refreshedAt,
  };
};

const parseStoredArgs = (argsJson: string | null): readonly string[] => {
  if (argsJson === null) {
    return [];
  }

  return parse(array(pipe(string(), trim())), JSON.parse(argsJson));
};

const presetWithCommand = ({
  args,
  command,
  preset,
}: {
  readonly preset: AgentPreset;
  readonly command: string;
  readonly args: readonly string[];
}): AgentPreset =>
  parse(agentPresetSchema, {
    ...preset,
    command,
    args: [...args],
  });

const customProviderDescription =
  'Custom ACP-compatible command. Find one in the ACP agent list or implement an ACP agent server.';

const customProviderPresetFromRecord = (
  record: typeof customAgentProvidersTable.$inferSelect,
): AgentPreset =>
  presetWithCommand({
    preset: {
      id: record.id,
      label: record.name,
      description: customProviderDescription,
      command: record.command,
      args: [...parseStoredArgs(record.argsJson)],
      authMethodId: undefined,
      modelSelectLabel: 'Model',
      modeSelectLabel: 'Mode',
    },
    command: record.command,
    args: parseStoredArgs(record.argsJson),
  });

const resolveCustomProviderCommand = (
  commandText: string,
): {
  readonly command: string;
  readonly args: readonly string[];
} => {
  const parsed = parseCommandLine(commandText);
  if (!parsed.ok) {
    throw new Error(`Custom Provider command is invalid: ${parsed.error}`);
  }

  return {
    command: parsed.command,
    args: parsed.args,
  };
};

export const createProviderCatalogStore = (database: AppDatabase = getDefaultDatabase()) => {
  const listProviderStatuses = async (): Promise<readonly AgentProviderStatus[]> => {
    const [rows, customRows, catalogRows] = await Promise.all([
      database.db.select().from(enabledAgentProvidersTable),
      database.db.select().from(customAgentProvidersTable),
      database.db.select().from(agentProviderCatalogsTable),
    ]);
    const currentCwd = process.cwd();
    const builtInStatuses = agentPresets.map((preset) => {
      const row = rows.find((entry) => entry.presetId === preset.id);
      const catalogRow = catalogRows.find(
        (entry) => entry.presetId === preset.id && entry.cwd === currentCwd,
      );
      return parse(agentProviderStatusSchema, {
        preset,
        enabled: row !== undefined,
        enabledAt: row?.enabledAt ?? null,
        updatedAt: row?.updatedAt ?? null,
        catalogSummary: catalogSummaryFrom(catalogRow),
      });
    });
    const customStatuses = customRows
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map((row) => {
        const catalogRow = catalogRows.find(
          (entry) => entry.presetId === row.id && entry.cwd === currentCwd,
        );
        return parse(agentProviderStatusSchema, {
          preset: customProviderPresetFromRecord(row),
          enabled: true,
          enabledAt: row.createdAt,
          updatedAt: row.updatedAt,
          catalogSummary: catalogSummaryFrom(catalogRow),
        });
      });

    return [...builtInStatuses, ...customStatuses];
  };

  const setProviderEnabled = async ({
    enabled,
    presetId,
  }: {
    readonly presetId: string;
    readonly enabled: boolean;
  }): Promise<readonly AgentProviderStatus[]> => {
    const preset = agentPresets.find((entry) => entry.id === presetId);
    if (preset === undefined) {
      throw new Error(`Unknown ACP provider preset: ${presetId}`);
    }

    if (enabled) {
      const now = new Date().toISOString();
      await database.db
        .insert(enabledAgentProvidersTable)
        .values({
          presetId,
          enabledAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: enabledAgentProvidersTable.presetId,
          set: {
            updatedAt: now,
          },
        });
    } else {
      await database.db
        .delete(enabledAgentProvidersTable)
        .where(eq(enabledAgentProvidersTable.presetId, presetId));
    }

    return listProviderStatuses();
  };

  const createCustomProvider = async ({
    commandText,
    name,
  }: {
    readonly name: string;
    readonly commandText: string;
  }): Promise<readonly AgentProviderStatus[]> => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new Error('Custom Provider name is required.');
    }

    const [existing] = await database.db
      .select({ id: customAgentProvidersTable.id })
      .from(customAgentProvidersTable)
      .where(eq(customAgentProvidersTable.name, trimmedName))
      .limit(1);
    if (existing !== undefined) {
      throw new Error(`Custom Provider already exists: ${trimmedName}`);
    }

    const customCommand = resolveCustomProviderCommand(commandText);
    const now = new Date().toISOString();
    await database.db.insert(customAgentProvidersTable).values({
      id: `${customProviderIdPrefix}${crypto.randomUUID()}`,
      name: trimmedName,
      command: customCommand.command,
      argsJson: JSON.stringify(customCommand.args),
      createdAt: now,
      updatedAt: now,
    });

    return listProviderStatuses();
  };

  const updateCustomProvider = async ({
    commandText,
    name,
    providerId,
  }: {
    readonly providerId: string;
    readonly name: string;
    readonly commandText: string;
  }): Promise<readonly AgentProviderStatus[]> => {
    if (!providerId.startsWith(customProviderIdPrefix)) {
      throw new Error(`Not a Custom Provider id: ${providerId}`);
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      throw new Error('Custom Provider name is required.');
    }

    const [existing] = await database.db
      .select({ id: customAgentProvidersTable.id })
      .from(customAgentProvidersTable)
      .where(eq(customAgentProvidersTable.name, trimmedName))
      .limit(1);
    if (existing !== undefined && existing.id !== providerId) {
      throw new Error(`Custom Provider already exists: ${trimmedName}`);
    }

    const customCommand = resolveCustomProviderCommand(commandText);
    const now = new Date().toISOString();
    await database.db
      .update(customAgentProvidersTable)
      .set({
        name: trimmedName,
        command: customCommand.command,
        argsJson: JSON.stringify(customCommand.args),
        updatedAt: now,
      })
      .where(eq(customAgentProvidersTable.id, providerId));
    await database.db
      .delete(agentProviderCatalogsTable)
      .where(eq(agentProviderCatalogsTable.presetId, providerId));

    return listProviderStatuses();
  };

  const deleteCustomProvider = async (
    providerId: string,
  ): Promise<readonly AgentProviderStatus[]> => {
    if (!providerId.startsWith(customProviderIdPrefix)) {
      throw new Error(`Not a Custom Provider id: ${providerId}`);
    }

    await database.db
      .delete(customAgentProvidersTable)
      .where(eq(customAgentProvidersTable.id, providerId));
    await database.db
      .delete(agentProviderCatalogsTable)
      .where(eq(agentProviderCatalogsTable.presetId, providerId));

    return listProviderStatuses();
  };

  const resolveProviderPreset = async (presetId: string): Promise<AgentPreset> => {
    const preset = agentPresets.find((entry) => entry.id === presetId);
    if (preset !== undefined) {
      return preset;
    }

    const [row] = await database.db
      .select()
      .from(customAgentProvidersTable)
      .where(eq(customAgentProvidersTable.id, presetId))
      .limit(1);

    if (row !== undefined) {
      return customProviderPresetFromRecord(row);
    }

    throw new Error(`Unknown ACP provider preset: ${presetId}`);
  };

  const listEnabledPresetIds = async (): Promise<readonly string[]> => {
    const rows = await database.db.select().from(enabledAgentProvidersTable);
    return rows.map((row) => row.presetId);
  };

  const getCatalog = async ({
    cwd,
    presetId,
  }: {
    readonly presetId: string;
    readonly cwd: string;
  }): Promise<AgentModelCatalogResponse | null> => {
    const [record] = await database.db
      .select()
      .from(agentProviderCatalogsTable)
      .where(
        and(
          eq(agentProviderCatalogsTable.presetId, presetId),
          eq(agentProviderCatalogsTable.cwd, cwd),
        ),
      )
      .limit(1);
    return parseCatalog(record);
  };

  const upsertCatalog = async ({
    catalog,
    cwd,
    emitIfChanged = true,
    lastError = null,
    presetId,
  }: {
    readonly presetId: string;
    readonly cwd: string;
    readonly catalog: AgentModelCatalogResponse;
    readonly lastError?: string | null;
    readonly emitIfChanged?: boolean;
  }): Promise<void> => {
    const previous = await getCatalog({ presetId, cwd });
    const now = new Date().toISOString();
    const payload = {
      availableModesJson: JSON.stringify(catalog.availableModes),
      availableModelsJson: JSON.stringify(catalog.availableModels),
      currentModeId: catalog.currentModeId ?? null,
      currentModelId: catalog.currentModelId ?? null,
      lastError,
      refreshedAt: now,
      updatedAt: now,
    };
    await database.db
      .insert(agentProviderCatalogsTable)
      .values({
        presetId,
        cwd,
        ...payload,
      })
      .onConflictDoUpdate({
        target: [agentProviderCatalogsTable.presetId, agentProviderCatalogsTable.cwd],
        set: payload,
      });

    if (emitIfChanged && !catalogEquals(previous, catalog)) {
      emitAcpSse({ type: 'agent_catalog_updated', presetId, cwd });
    }
  };

  const markCatalogError = async ({
    cwd,
    error,
    presetId,
  }: {
    readonly presetId: string;
    readonly cwd: string;
    readonly error: string;
  }): Promise<void> => {
    const previous = await getCatalog({ presetId, cwd });
    const emptyCatalog: AgentModelCatalogResponse = previous ?? {
      availableModels: [],
      availableModes: [],
      currentModelId: null,
      currentModeId: null,
      lastError: error,
    };
    await upsertCatalog({
      presetId,
      cwd,
      catalog: {
        ...emptyCatalog,
        lastError: error,
      },
      lastError: error,
      emitIfChanged: true,
    });
  };

  return {
    createCustomProvider,
    deleteCustomProvider,
    getCatalog,
    listEnabledPresetIds,
    listProviderStatuses,
    resolveProviderPreset,
    setProviderEnabled,
    updateCustomProvider,
    markCatalogError,
    upsertCatalog,
  };
};

let defaultProviderCatalogStore: ReturnType<typeof createProviderCatalogStore> | undefined =
  undefined;

const getProviderCatalogStore = () => {
  defaultProviderCatalogStore ??= createProviderCatalogStore();
  return defaultProviderCatalogStore;
};

export const listProviderStatuses = async (): Promise<readonly AgentProviderStatus[]> =>
  getProviderCatalogStore().listProviderStatuses();

export const setProviderEnabled = async (input: {
  readonly presetId: string;
  readonly enabled: boolean;
}): Promise<readonly AgentProviderStatus[]> => getProviderCatalogStore().setProviderEnabled(input);

export const createCustomProvider = async (input: {
  readonly name: string;
  readonly commandText: string;
}): Promise<readonly AgentProviderStatus[]> =>
  getProviderCatalogStore().createCustomProvider(input);

export const deleteCustomProvider = async (input: {
  readonly providerId: string;
}): Promise<readonly AgentProviderStatus[]> =>
  getProviderCatalogStore().deleteCustomProvider(input.providerId);

export const updateCustomProvider = async (input: {
  readonly providerId: string;
  readonly name: string;
  readonly commandText: string;
}): Promise<readonly AgentProviderStatus[]> =>
  getProviderCatalogStore().updateCustomProvider(input);

export const resolveProviderPreset = async (input: {
  readonly presetId: string;
}): Promise<AgentPreset> => getProviderCatalogStore().resolveProviderPreset(input.presetId);

export const listEnabledPresetIds = async (): Promise<readonly string[]> =>
  getProviderCatalogStore().listEnabledPresetIds();

export const getProviderCatalog = async (input: {
  readonly presetId: string;
  readonly cwd: string;
}): Promise<AgentModelCatalogResponse | null> => getProviderCatalogStore().getCatalog(input);

export const upsertProviderCatalog = async (input: {
  readonly presetId: string;
  readonly cwd: string;
  readonly catalog: AgentModelCatalogResponse;
  readonly lastError?: string | null;
  readonly emitIfChanged?: boolean;
}): Promise<void> => getProviderCatalogStore().upsertCatalog(input);

export const markProviderCatalogError = async (input: {
  readonly presetId: string;
  readonly cwd: string;
  readonly error: string;
}): Promise<void> => getProviderCatalogStore().markCatalogError(input);
