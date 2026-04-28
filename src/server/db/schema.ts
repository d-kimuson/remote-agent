import { sql } from 'drizzle-orm';
import { index, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const appSettingsTable = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const projectsTable = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    workingDirectory: text('working_directory').notNull().unique(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_projects_created_at').on(table.createdAt)],
);

export const sessionsTable = sqliteTable(
  'sessions',
  {
    sessionId: text('session_id').primaryKey(),
    origin: text('origin').notNull(),
    projectId: text('project_id').references(() => projectsTable.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    presetId: text('preset_id'),
    command: text('command').notNull(),
    argsJson: text('args_json').notNull(),
    cwd: text('cwd').notNull(),
    createdAt: text('created_at').notNull(),
    title: text('title'),
    updatedAt: text('updated_at'),
    currentModeId: text('current_mode_id'),
    currentModelId: text('current_model_id'),
    availableModesJson: text('available_modes_json').notNull(),
    availableModelsJson: text('available_models_json').notNull(),
  },
  (table) => [
    index('idx_sessions_created_at').on(table.createdAt),
    index('idx_sessions_project_id').on(table.projectId),
  ],
);

export const enabledAgentProvidersTable = sqliteTable(
  'enabled_agent_providers',
  {
    presetId: text('preset_id').primaryKey(),
    enabledAt: text('enabled_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_enabled_agent_providers_updated_at').on(table.updatedAt)],
);

export const agentProviderCatalogsTable = sqliteTable(
  'agent_provider_catalogs',
  {
    presetId: text('preset_id').notNull(),
    cwd: text('cwd').notNull(),
    availableModesJson: text('available_modes_json').notNull(),
    availableModelsJson: text('available_models_json').notNull(),
    currentModeId: text('current_mode_id'),
    currentModelId: text('current_model_id'),
    lastError: text('last_error'),
    refreshedAt: text('refreshed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.presetId, table.cwd] }),
    index('idx_agent_provider_catalogs_preset_id').on(table.presetId),
    index('idx_agent_provider_catalogs_updated_at').on(table.updatedAt),
  ],
);

export const projectModelPreferencesTable = sqliteTable(
  'project_model_preferences',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projectsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    presetId: text('preset_id').notNull(),
    modelId: text('model_id').notNull(),
    isFavorite: text('is_favorite').notNull().default('false'),
    lastUsedAt: text('last_used_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.presetId, table.modelId] }),
    index('idx_project_model_preferences_project_preset').on(table.projectId, table.presetId),
    index('idx_project_model_preferences_last_used').on(table.lastUsedAt),
  ],
);

export const sessionMessagesTable = sqliteTable(
  'session_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessionsTable.sessionId, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    role: text('role').notNull(),
    text: text('text').notNull(),
    rawEventsJson: text('raw_events_json').notNull(),
    createdAt: text('created_at').notNull(),
    messageKind: text('message_kind').notNull().default('legacy_assistant_turn'),
    streamPartId: text('stream_part_id'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_session_messages_session_id').on(table.sessionId),
    index('idx_session_messages_created_at').on(table.createdAt),
    uniqueIndex('idx_session_messages_stream_part')
      .on(table.sessionId, table.streamPartId)
      .where(sql`${table.streamPartId} IS NOT NULL`),
  ],
);
