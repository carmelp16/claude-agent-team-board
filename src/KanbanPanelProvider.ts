import * as vscode from 'vscode';
import { TaskDataProvider } from './taskDataProvider';
import { ExtToWebviewMessage, WebviewToExtMessage, TeamMember } from './types';

export class KanbanPanelProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private taskProvider: TaskDataProvider;
  private currentTeam: string | undefined;
  private currentMembers: TeamMember[] = [];
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.taskProvider = new TaskDataProvider();
  }

  createOrShow(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'claudeKanban',
      'Claude Kanban',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'src', 'webview')
        ],
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtMessage) => this.handleWebviewMessage(msg),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.taskProvider.stopAllWatchers();
    }, null, this.disposables);

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claude-kanban') && this.currentTeam) {
        this.selectTeam(this.currentTeam);
      }
    }, null, this.disposables);

    // Watch for new/deleted teams while panel is open
    this.taskProvider.watchTeamList(() => this.onTeamListChanged());

    this.promptTeamSelection();
  }

  private teamCount = 0;

  private async onTeamListChanged(): Promise<void> {
    const teams = await this.taskProvider.discoverTeams();
    const newCount = teams.length;

    if (newCount === 0) {
      // All teams gone
      this.currentTeam = undefined;
      this.currentMembers = [];
      this.teamCount = 0;
      this.postMessage({ type: 'noTeams' });
    } else if (this.currentTeam && !teams.includes(this.currentTeam)) {
      // Current team was deleted — auto-switch to first available
      this.teamCount = newCount;
      this.selectTeam(teams[0]);
    } else if (!this.currentTeam && newCount > 0) {
      // Was showing "no teams", now one appeared — auto-select it
      this.teamCount = newCount;
      this.selectTeam(teams[0]);
    } else {
      // Team count changed but current team still exists — update count for Switch Team visibility
      this.teamCount = newCount;
      await this.sendUpdate();
    }
  }

  private async promptTeamSelection(): Promise<void> {
    const teams = await this.taskProvider.discoverTeams();
    this.teamCount = teams.length;

    if (teams.length === 0) {
      this.postMessage({ type: 'noTeams' });
      return;
    }

    if (teams.length === 1) {
      this.selectTeam(teams[0]);
      return;
    }

    const picked = await vscode.window.showQuickPick(teams, {
      placeHolder: 'Select a team to view'
    });
    if (picked) {
      this.selectTeam(picked);
    }
  }

  private async selectTeam(teamName: string): Promise<void> {
    this.currentTeam = teamName;
    this.panel!.title = `Kanban: ${teamName}`;

    const config = await this.taskProvider.readTeamConfig(teamName);
    this.currentMembers = config?.members ?? [];

    this.taskProvider.watchTeam(
      teamName,
      () => this.sendUpdate(),
      () => this.refreshMembers(teamName),
      () => this.sendUpdate()
    );
    await this.sendUpdate();
  }

  private async refreshMembers(teamName: string): Promise<void> {
    const config = await this.taskProvider.readTeamConfig(teamName);
    this.currentMembers = config?.members ?? [];
    await this.sendUpdate();
  }

  private async sendUpdate(): Promise<void> {
    if (!this.currentTeam) {
      return;
    }
    const [tasks, pendingPermissions] = await Promise.all([
      this.taskProvider.readTeamTasks(this.currentTeam),
      this.taskProvider.readPendingPermissions(this.currentTeam)
    ]);
    this.postMessage({
      type: 'updateTasks',
      tasks,
      teamName: this.currentTeam,
      members: this.currentMembers,
      teamCount: this.teamCount,
      pendingPermissions
    });
  }

  private handleWebviewMessage(msg: WebviewToExtMessage): void {
    switch (msg.type) {
      case 'ready':
        this.sendUpdate();
        break;
      case 'selectTeam':
        this.promptTeamSelection();
        break;
    }
  }

  private postMessage(msg: ExtToWebviewMessage): void {
    this.panel?.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'style.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'main.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Claude Kanban</title>
</head>
<body>
  <div id="toolbar">
    <div id="toolbar-left">
      <span id="toolbar-title">Claude Tasks</span>
      <span id="team-name"></span>
    </div>
    <div id="toolbar-right">
      <button id="switch-team-btn">Switch Team</button>
    </div>
  </div>
  <div id="members-strip"></div>
  <div id="board">
    <div class="column" data-status="pending">
      <div class="column-header">
        <span class="column-title">Pending</span>
        <span class="count">0</span>
      </div>
      <div class="card-list"></div>
    </div>
    <div class="column" data-status="in_progress">
      <div class="column-header">
        <span class="column-title">In Progress</span>
        <span class="count">0</span>
      </div>
      <div class="card-list"></div>
    </div>
    <div class="column" data-status="completed">
      <div class="column-header">
        <span class="column-title">Completed</span>
        <span class="count">0</span>
      </div>
      <div class="card-list"></div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.taskProvider.stopAllWatchers();
    this.disposables.forEach(d => d.dispose());
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
