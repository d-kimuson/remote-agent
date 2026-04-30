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
    worktreeSetupScript: text('worktree_setup_script').notNull().default(''),
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
    configOptionsJson: text('config_options_json').notNull().default('[]'),
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

export const customAgentProvidersTable = sqliteTable(
  'custom_agent_providers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    command: text('command').notNull(),
    argsJson: text('args_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_custom_agent_providers_name').on(table.name),
    index('idx_custom_agent_providers_updated_at').on(table.updatedAt),
  ],
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

export const projectModePreferencesTable = sqliteTable(
  'project_mode_preferences',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projectsTable.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    presetId: text('preset_id').notNull(),
    modeId: text('mode_id').notNull(),
    lastUsedAt: text('last_used_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.presetId, table.modeId] }),
    index('idx_project_mode_preferences_project_preset').on(table.projectId, table.presetId),
    index('idx_project_mode_preferences_last_used').on(table.lastUsedAt),
  ],
);

export const routinesTable = sqliteTable(
  'routines',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    enabled: text('enabled').notNull(),
    kind: text('kind').notNull(),
    configJson: text('config_json').notNull(),
    sendConfigJson: text('send_config_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at'),
    lastError: text('last_error'),
  },
  (table) => [
    index('idx_routines_enabled_next_run_at').on(table.enabled, table.nextRunAt),
    index('idx_routines_updated_at').on(table.updatedAt),
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
    kind: text('kind').notNull(),
    textForSearch: text('text_for_search').notNull().default(''),
    rawJson: text('raw_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_session_messages_session_created').on(table.sessionId, table.createdAt),
    index('idx_session_messages_session_kind').on(table.sessionId, table.kind),
  ],
);
