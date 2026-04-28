import type { AgentCapabilities, SessionInfo } from "@agentclientprotocol/sdk";

export type ResumeCapabilitySnapshot = {
  readonly loadSession: boolean;
  readonly listSessions: boolean;
  readonly resumeSession: boolean;
  readonly canLoadIntoProvider: boolean;
  readonly fallbackReason: string | null;
};

export type ResumableSessionCandidate = {
  readonly sessionId: string;
  readonly cwd: string;
  readonly title: string | null;
  readonly updatedAt: string | null;
  readonly loadable: boolean;
};

const fallbackReasonFrom = ({
  loadSession,
  listSessions,
  resumeSession,
}: Omit<ResumeCapabilitySnapshot, "canLoadIntoProvider" | "fallbackReason">): string | null => {
  if (loadSession && listSessions) {
    return null;
  }

  if (loadSession) {
    return "Agent supports loadSession but not session/list. A known sessionId is required.";
  }

  if (listSessions && resumeSession) {
    return "Agent can list sessions and resume them, but this PoC cannot safely bind session/resume to the current AI SDK provider.";
  }

  if (listSessions) {
    return "Agent can list sessions but does not advertise loadSession. This PoC cannot import the listed sessions safely.";
  }

  if (resumeSession) {
    return "Agent advertises session/resume only. This PoC requires loadSession to bind an existing session to the current AI SDK provider.";
  }

  return "Agent does not advertise loadSession, session/list, or session/resume.";
};

export const inspectResumeCapabilities = (
  capabilities: AgentCapabilities | null | undefined,
): ResumeCapabilitySnapshot => {
  const loadSession = capabilities?.loadSession === true;
  const listSessions =
    capabilities?.sessionCapabilities?.list !== null &&
    capabilities?.sessionCapabilities?.list !== undefined;
  const resumeSession =
    capabilities?.sessionCapabilities?.resume !== null &&
    capabilities?.sessionCapabilities?.resume !== undefined;

  return {
    loadSession,
    listSessions,
    resumeSession,
    canLoadIntoProvider: loadSession,
    fallbackReason: fallbackReasonFrom({
      loadSession,
      listSessions,
      resumeSession,
    }),
  };
};

export const mapResumableSessionCandidates = (
  sessions: readonly SessionInfo[],
  capability: ResumeCapabilitySnapshot,
): readonly ResumableSessionCandidate[] => {
  return sessions.map((session) => ({
    sessionId: session.sessionId,
    cwd: session.cwd,
    title: session.title ?? null,
    updatedAt: session.updatedAt ?? null,
    loadable: capability.canLoadIntoProvider,
  }));
};

export const excludeManagedResumableSessions = <Candidate extends { readonly sessionId: string }>({
  candidates,
  managedSessionIds,
}: {
  readonly candidates: readonly Candidate[];
  readonly managedSessionIds: ReadonlySet<string>;
}): readonly Candidate[] => {
  return candidates.filter((candidate) => !managedSessionIds.has(candidate.sessionId));
};
