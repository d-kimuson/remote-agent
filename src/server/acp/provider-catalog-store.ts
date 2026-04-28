import { and, eq } from "drizzle-orm";
import { array, parse } from "valibot";

import {
  agentProviderStatusSchema,
  modeOptionSchema,
  modelOptionSchema,
  type AgentModelCatalogResponse,
  type AgentProviderStatus,
} from "../../shared/acp.ts";
import { agentProviderCatalogsTable, enabledAgentProvidersTable } from "../db/schema.ts";
import { type AppDatabase, getDefaultDatabase } from "../db/sqlite.ts";
import { agentPresets } from "./presets.ts";
import { emitAcpSse } from "./sse-broadcast.ts";

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

export const createProviderCatalogStore = (database: AppDatabase = getDefaultDatabase()) => {
  const listProviderStatuses = async (): Promise<readonly AgentProviderStatus[]> => {
    const rows = await database.db.select().from(enabledAgentProvidersTable);
    return agentPresets.map((preset) => {
      const row = rows.find((entry) => entry.presetId === preset.id);
      return parse(agentProviderStatusSchema, {
        preset,
        enabled: row !== undefined,
        enabledAt: row?.enabledAt ?? null,
        updatedAt: row?.updatedAt ?? null,
      });
    });
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
      emitAcpSse({ type: "agent_catalog_updated", presetId, cwd });
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
    getCatalog,
    listEnabledPresetIds,
    listProviderStatuses,
    setProviderEnabled,
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
