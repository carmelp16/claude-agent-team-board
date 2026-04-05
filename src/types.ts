export interface TaskData {
  id: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  blocks: string[];
  blockedBy: string[];
  owner?: string;
  activeForm?: string;
  metadata?: Record<string, unknown>;
}

export interface TeamConfig {
  name: string;
  description: string;
  createdAt: number;
  members: TeamMember[];
}

export interface TeamMember {
  name: string;
  agentType: string;
  model?: string;
  color?: string;
  isActive?: boolean | null;
}

export type ExtToWebviewMessage =
  | { type: 'updateTasks'; tasks: TaskData[]; teamName: string; members: TeamMember[]; teamCount: number; pendingPermissions: string[] }
  | { type: 'noTeams' }
  | { type: 'error'; message: string };

export type WebviewToExtMessage =
  | { type: 'ready' }
  | { type: 'selectTeam' };
