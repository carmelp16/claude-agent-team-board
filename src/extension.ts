import * as vscode from 'vscode';
import { KanbanPanelProvider } from './KanbanPanelProvider';

export function activate(context: vscode.ExtensionContext) {
  const provider = new KanbanPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeKanban.openBoard', () => {
      provider.createOrShow();
    })
  );

  context.subscriptions.push(provider);
}

export function deactivate() {}
