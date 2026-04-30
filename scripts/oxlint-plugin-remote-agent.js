const rawSqliteMethods = new Set(['exec', 'prepare']);
const sqliteBootstrapFileSuffix = '/src/server/db/sqlite.ts';
const allowedSqliteBootstrapExec = 'PRAGMA foreign_keys = ON;';

const isStaticMemberCall = (callee) => {
  return callee.type === 'MemberExpression' && callee.computed === false;
};

const isAllowedSqliteBootstrapExec = (context, node, methodName) => {
  if (methodName !== 'exec' || !context.filename.endsWith(sqliteBootstrapFileSuffix)) {
    return false;
  }

  const [firstArgument] = node.arguments;
  return firstArgument?.type === 'Literal' && firstArgument.value === allowedSqliteBootstrapExec;
};

const noRawSqliteQuery = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow raw node:sqlite query APIs in server code',
    },
    messages: {
      noRawSqliteQuery: 'Use Drizzle schema/query APIs instead of raw SQLite {{methodName}}().',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (!isStaticMemberCall(callee)) {
          return;
        }

        const methodName = callee.property.name;
        if (!rawSqliteMethods.has(methodName)) {
          return;
        }
        if (isAllowedSqliteBootstrapExec(context, node, methodName)) {
          return;
        }

        context.report({
          node: callee.property,
          messageId: 'noRawSqliteQuery',
          data: { methodName },
        });
      },
    };
  },
};

export default {
  rules: {
    'no-raw-sqlite-query': noRawSqliteQuery,
  },
};
