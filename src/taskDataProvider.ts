import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TaskData, TeamConfig } from './types';

export class TaskDataProvider {
  private taskWatcher: fs.FSWatcher | undefined;
  private teamListWatcher: fs.FSWatcher | undefined;
  private teamConfigWatcher: fs.FSWatcher | undefined;
  private inboxWatcher: fs.FSWatcher | undefined;
  private taskDebounce: NodeJS.Timeout | undefined;
  private teamListDebounce: NodeJS.Timeout | undefined;
  private teamConfigDebounce: NodeJS.Timeout | undefined;
  private inboxDebounce: NodeJS.Timeout | undefined;

  private getTasksDir(): string {
    const config = vscode.workspace.getConfiguration('claude-kanban');
    const custom = config.get<string>('tasksDirectory');
    if (custom) {
      return custom;
    }
    return path.join(os.homedir(), '.claude', 'tasks');
  }

  private getTeamsDir(): string {
    const config = vscode.workspace.getConfiguration('claude-kanban');
    const custom = config.get<string>('teamsDirectory');
    if (custom) {
      return custom;
    }
    return path.join(os.homedir(), '.claude', 'teams');
  }

  async discoverTeams(): Promise<string[]> {
    try {
      // Only show teams that have a config in ~/.claude/teams/ (filters out UUID session dirs)
      const teamsDir = this.getTeamsDir();
      const entries = await fs.promises.readdir(teamsDir, { withFileTypes: true });
      const namedTeams = entries.filter(e => e.isDirectory()).map(e => e.name);

      // Verify each has a tasks directory too
      const tasksDir = this.getTasksDir();
      const withTasks = await Promise.all(
        namedTeams.map(async (name) => {
          try {
            const stat = await fs.promises.stat(path.join(tasksDir, name));
            return stat.isDirectory() ? name : null;
          } catch {
            return null;
          }
        })
      );

      return withTasks.filter((t): t is string => t !== null);
    } catch {
      return [];
    }
  }

  async readTeamConfig(teamName: string): Promise<TeamConfig | null> {
    try {
      const raw = await fs.promises.readFile(
        path.join(this.getTeamsDir(), teamName, 'config.json'),
        'utf-8'
      );
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async readTeamTasks(teamName: string): Promise<TaskData[]> {
    const teamDir = path.join(this.getTasksDir(), teamName);
    try {
      const files = await fs.promises.readdir(teamDir);
      const jsonFiles = files.filter(f => /^\d+\.json$/.test(f));

      const tasks = await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const raw = await fs.promises.readFile(path.join(teamDir, file), 'utf-8');
            return JSON.parse(raw) as TaskData;
          } catch {
            return null;
          }
        })
      );

      return tasks
        .filter((t): t is TaskData => t !== null)
        .sort((a, b) => Number(a.id) - Number(b.id));
    } catch {
      return [];
    }
  }

  async readPendingPermissions(teamName: string): Promise<string[]> {
    const inboxPath = path.join(this.getTeamsDir(), teamName, 'inboxes', 'team-lead.json');
    try {
      const raw = await fs.promises.readFile(inboxPath, 'utf-8');
      const messages: Array<{ from?: string; text?: string; read?: boolean }> = JSON.parse(raw);
      const agentsWaiting = new Set<string>();

      for (const msg of messages) {
        if (msg.read || !msg.text || !msg.from) { continue; }
        try {
          const parsed = JSON.parse(msg.text);
          if (parsed.type === 'permission_request') {
            agentsWaiting.add(msg.from);
          }
        } catch {
          // Not JSON text, skip
        }
      }

      return Array.from(agentsWaiting);
    } catch {
      return [];
    }
  }

  watchTeam(teamName: string, onTaskUpdate: () => void, onMembersUpdate: () => void, onInboxUpdate?: () => void): void {
    this.stopTaskWatcher();
    this.stopTeamConfigWatcher();
    this.stopInboxWatcher();

    // Watch task files for changes
    const teamDir = path.join(this.getTasksDir(), teamName);
    try {
      this.taskWatcher = fs.watch(teamDir, { persistent: false }, () => {
        if (this.taskDebounce) { clearTimeout(this.taskDebounce); }
        this.taskDebounce = setTimeout(onTaskUpdate, 200);
      });
    } catch {
      // Directory may not exist yet
    }

    // Watch team config for member changes
    const configPath = path.join(this.getTeamsDir(), teamName, 'config.json');
    try {
      this.teamConfigWatcher = fs.watch(configPath, { persistent: false }, () => {
        if (this.teamConfigDebounce) { clearTimeout(this.teamConfigDebounce); }
        this.teamConfigDebounce = setTimeout(onMembersUpdate, 300);
      });
    } catch {
      // Config may not exist
    }

    // Watch team-lead inbox for permission requests
    if (onInboxUpdate) {
      const inboxPath = path.join(this.getTeamsDir(), teamName, 'inboxes', 'team-lead.json');
      try {
        this.inboxWatcher = fs.watch(inboxPath, { persistent: false }, () => {
          if (this.inboxDebounce) { clearTimeout(this.inboxDebounce); }
          this.inboxDebounce = setTimeout(onInboxUpdate, 200);
        });
      } catch {
        // Inbox may not exist yet
      }
    }
  }

  watchTeamList(onTeamListChange: () => void): void {
    this.stopTeamListWatcher();

    const teamsDir = this.getTeamsDir();
    try {
      this.teamListWatcher = fs.watch(teamsDir, { persistent: false }, () => {
        if (this.teamListDebounce) { clearTimeout(this.teamListDebounce); }
        this.teamListDebounce = setTimeout(onTeamListChange, 300);
      });
    } catch {
      // Directory may not exist
    }
  }

  private stopTaskWatcher(): void {
    if (this.taskDebounce) { clearTimeout(this.taskDebounce); this.taskDebounce = undefined; }
    this.taskWatcher?.close();
    this.taskWatcher = undefined;
  }

  private stopTeamConfigWatcher(): void {
    if (this.teamConfigDebounce) { clearTimeout(this.teamConfigDebounce); this.teamConfigDebounce = undefined; }
    this.teamConfigWatcher?.close();
    this.teamConfigWatcher = undefined;
  }

  private stopTeamListWatcher(): void {
    if (this.teamListDebounce) { clearTimeout(this.teamListDebounce); this.teamListDebounce = undefined; }
    this.teamListWatcher?.close();
    this.teamListWatcher = undefined;
  }

  private stopInboxWatcher(): void {
    if (this.inboxDebounce) { clearTimeout(this.inboxDebounce); this.inboxDebounce = undefined; }
    this.inboxWatcher?.close();
    this.inboxWatcher = undefined;
  }

  stopAllWatchers(): void {
    this.stopTaskWatcher();
    this.stopTeamConfigWatcher();
    this.stopTeamListWatcher();
    this.stopInboxWatcher();
  }
}
