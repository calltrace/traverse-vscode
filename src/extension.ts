import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';
import { BinaryFinder } from './binaryFinder';
import { Downloader } from './downloader';
import { CONSTANTS } from './constants';

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel;

/**
 * Gets the path to the server binary using the binary finder
 */
async function getServerPath(context: vscode.ExtensionContext): Promise<string | undefined> {
    outputChannel.appendLine('Looking for Traverse LSP server binary...');
    const finder = new BinaryFinder(context);
    const location = await finder.find();
    
    if (location) {
        outputChannel.appendLine(`Found binary from ${location.source}: ${location.path}`);
        outputChannel.show(true); // Show output panel
        
        // Ensure it's executable on Unix systems
        if (os.platform() !== 'win32' && location.source !== 'settings') {
            try {
                fs.chmodSync(location.path, 0o755);
                outputChannel.appendLine('Made binary executable');
            } catch (err) {
                outputChannel.appendLine(`Failed to make binary executable: ${err}`);
            }
        }
        return location.path;
    }
    
    outputChannel.appendLine('No binary found');
    return undefined;
}

async function startLanguageServer(context: vscode.ExtensionContext, serverPath: string) {
    outputChannel.appendLine(`Starting Traverse LSP server from: ${serverPath}`);
    outputChannel.show(true);
    
    // Server options - run the binary
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const serverOptions: ServerOptions = {
        run: {
            command: serverPath,
            transport: TransportKind.stdio,
            options: {
                cwd: workspaceFolder,  // Set working directory to workspace root
                env: {
                    ...process.env,
                    RUST_LOG: 'info',
                    TRAVERSE_LSP_TRACE: vscode.workspace.getConfiguration('traverse-lsp').get('trace.server') || 'off'
                }
            }
        },
        debug: {
            command: serverPath,
            transport: TransportKind.stdio,
            options: {
                cwd: workspaceFolder,  // Set working directory to workspace root
                env: {
                    ...process.env,
                    RUST_LOG: 'debug',
                    TRAVERSE_LSP_TRACE: 'verbose'
                }
            }
        }
    };
    
    // Client options
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'solidity' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sol')
        },
        outputChannel,
        traceOutputChannel: outputChannel
    };
    
    // Create and start the language client
    client = new LanguageClient(
        'traverse-lsp',
        'Traverse Solidity Language Server',
        serverOptions,
        clientOptions
    );
    
    try {
        // Start the client
        await client.start();
        outputChannel.appendLine('✅ Traverse LSP server started successfully');
    } catch (error) {
        outputChannel.appendLine(`❌ Failed to start LSP server: ${error}`);
        throw error;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        // Immediate console log to verify activation
        console.log('TRAVERSE EXTENSION: Activation started!');
        
        // Create output channel first
        outputChannel = vscode.window.createOutputChannel('Traverse LSP');
        outputChannel.appendLine('=== Traverse LSP Extension Activating ===');
        outputChannel.appendLine(`Time: ${new Date().toISOString()}`);
        outputChannel.appendLine(`Extension path: ${context.extensionPath}`);
        outputChannel.appendLine(`VS Code version: ${vscode.version}`);
        outputChannel.appendLine(`Platform: ${CONSTANTS.platformIdentifier}`);
        outputChannel.show(true); // Show the output panel
        
        // Also show an information message to confirm activation
        vscode.window.showInformationMessage('Traverse Solidity Tools extension is activating...');
        
        // ALWAYS register commands - they should work even without server
        outputChannel.appendLine('Registering commands...');
        try {
            registerCommands(context);
            outputChannel.appendLine('Commands registered successfully');
        } catch (error) {
            outputChannel.appendLine(`ERROR registering commands: ${error}`);
            console.error('Failed to register commands:', error);
        }
        
        // Check if platform is supported - but don't return early
        if (!CONSTANTS.isCurrentPlatformSupported()) {
            const msg = `Platform ${CONSTANTS.platformIdentifier} is not supported by Traverse LSP`;
            outputChannel.appendLine(`WARNING: ${msg}`);
            vscode.window.showWarningMessage(msg);
            // Don't return - commands should still work
        } else {
            outputChannel.appendLine('Platform is supported, initializing server...');
            
            // Try to find and start the server (non-blocking)
            initializeServer(context).catch(error => {
                outputChannel.appendLine(`Server initialization failed: ${error}`);
            });
        }
        
        outputChannel.appendLine('=== Traverse LSP Extension Activated ===');
    } catch (error) {
        console.error('Extension activation failed:', error);
        if (outputChannel) {
            outputChannel.appendLine(`FATAL ERROR: ${error}`);
        }
        throw error;
    }
}

async function initializeServer(context: vscode.ExtensionContext) {
    outputChannel.appendLine('Initializing LSP server...');
    
    // Try to find the server
    let serverPath = await getServerPath(context);
    
    if (!serverPath) {
        outputChannel.appendLine('Server binary not found, prompting user...');
        
        // Prompt user to download
        const action = await vscode.window.showInformationMessage(
            'Traverse LSP server not found. Would you like to download it?',
            'Download',
            'Cancel'
        );
        
        outputChannel.appendLine(`User selected: ${action || 'Cancel'}`);
        
        if (action === 'Download') {
            outputChannel.appendLine('Starting download...');
            const downloader = new Downloader(context);
            const downloadedPath = await downloader.downloadLatestBinary();
            if (downloadedPath) {
                serverPath = downloadedPath;
                outputChannel.appendLine(`Downloaded to: ${downloadedPath}`);
            } else {
                outputChannel.appendLine('Download failed or was cancelled');
            }
        }
        
        if (!serverPath) {
            outputChannel.appendLine('❌ Server binary not found and download cancelled or failed');
            vscode.window.showWarningMessage(
                'Traverse LSP server is not installed. Use "Traverse: Download Language Server" command to install it.'
            );
            return;
        }
    }
    
    try {
        await startLanguageServer(context, serverPath);
    } catch (error) {
        outputChannel.appendLine(`❌ Failed to start server: ${error}`);
        vscode.window.showErrorMessage(`Failed to start Traverse LSP server: ${error}`);
    }
}

/**
 * Finds the project root by looking for common project markers
 * @param startPath The path to start searching from
 * @returns The project root path
 */
function findProjectRoot(startPath: string | undefined): string {
    // For now, always use the workspace root since sol2cg works from there
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    if (!workspaceRoot) {
        outputChannel.appendLine('No workspace folder found');
        return startPath || '';
    }
    
    outputChannel.appendLine(`Using workspace root as project root: ${workspaceRoot}`);
    return workspaceRoot;
}

/**
 * Ensures the LSP client is initialized, prompting for download if needed
 * @returns true if client is ready, false otherwise
 */
async function ensureLSPClient(context: vscode.ExtensionContext): Promise<boolean> {
    if (client) {
        return true;
    }
    
    outputChannel.appendLine('LSP server not running, checking for binary...');
    
    // Try to find existing binary
    const serverPath = await getServerPath(context);
    if (serverPath) {
        try {
            await startLanguageServer(context, serverPath);
            return true;
        } catch (error: any) {
            outputChannel.appendLine(`Failed to start server: ${error.message}`);
        }
    }
    
    // No binary found, prompt to download
    const action = await vscode.window.showInformationMessage(
        'Traverse LSP server is not installed. Would you like to download it now?',
        'Download',
        'Cancel'
    );
    
    if (action === 'Download') {
        outputChannel.appendLine('Starting download...');
        const downloader = new Downloader(context);
        const downloadedPath = await downloader.downloadLatestBinary();
        
        if (downloadedPath) {
            try {
                await startLanguageServer(context, downloadedPath);
                return true;
            } catch (error: any) {
                outputChannel.appendLine(`Failed to start downloaded server: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to start server: ${error.message}`);
            }
        }
    }
    
    return false;
}

function registerCommands(context: vscode.ExtensionContext) {
    // Workspace-level commands
    const generateCallGraph = vscode.commands.registerCommand(
        'traverse.generateCallGraph',
        async (uri?: vscode.Uri) => {
            outputChannel.appendLine('Command: Generate Call Graph');
            outputChannel.show(true);
            
            // Ensure LSP client is available
            if (!await ensureLSPClient(context)) {
                outputChannel.appendLine('LSP server not available - command cancelled');
                return;
            }
            
            const clickedPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const projectRoot = findProjectRoot(clickedPath);
            if (!projectRoot) {
                const msg = 'No project root found';
                outputChannel.appendLine(`Error: ${msg}`);
                vscode.window.showErrorMessage(msg);
                return;
            }
            
            outputChannel.appendLine(`Project root: ${projectRoot}`);
            
            try {
                const result = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating call graph...",
                    cancellable: false
                }, async () => {
                    const requestPayload = {
                        command: 'traverse.generateCallGraph.workspace',
                        arguments: [{ workspace_folder: projectRoot }]
                    };
                    outputChannel.appendLine(`Sending request to LSP server with payload: ${JSON.stringify(requestPayload, null, 2)}`);
                    return await client!.sendRequest('workspace/executeCommand', requestPayload);
                });
                
                outputChannel.appendLine('Received response from server');
                handleDiagramResult(result, 'Call Graph');
            } catch (error: any) {
                outputChannel.appendLine(`Error: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to generate call graph: ${error.message}`);
            }
        }
    );
    
    const generateSequenceDiagram = vscode.commands.registerCommand(
        'traverse.generateSequenceDiagram',
        async (uri?: vscode.Uri) => {
            outputChannel.appendLine('Command: Generate Sequence Diagram');
            outputChannel.show(true);
            
            // Ensure LSP client is available
            if (!await ensureLSPClient(context)) {
                outputChannel.appendLine('LSP server not available - command cancelled');
                return;
            }
            
            const clickedPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const projectRoot = findProjectRoot(clickedPath);
            if (!projectRoot) {
                const msg = 'No project root found';
                outputChannel.appendLine(`Error: ${msg}`);
                vscode.window.showErrorMessage(msg);
                return;
            }
            
            outputChannel.appendLine(`Project root: ${projectRoot}`);
            
            try {
                const result = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating sequence diagram...",
                    cancellable: false
                }, async () => {
                    outputChannel.appendLine('Sending request to LSP server...');
                    return await client!.sendRequest('workspace/executeCommand', {
                        command: 'traverse.generateSequenceDiagram.workspace',
                        arguments: [{ workspace_folder: projectRoot }]
                    });
                });
                
                outputChannel.appendLine('Received response from server');
                handleDiagramResult(result, 'Sequence Diagram');
            } catch (error: any) {
                outputChannel.appendLine(`Error: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to generate sequence diagram: ${error.message}`);
            }
        }
    );
    
    const generateAllAnalyses = vscode.commands.registerCommand(
        'traverse.generateAllAnalyses',
        async (uri?: vscode.Uri) => {
            outputChannel.appendLine('Command: Generate All Analyses');
            outputChannel.show(true);
            
            // Ensure LSP client is available
            if (!await ensureLSPClient(context)) {
                outputChannel.appendLine('LSP server not available - command cancelled');
                return;
            }
            
            const clickedPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const projectRoot = findProjectRoot(clickedPath);
            if (!projectRoot) {
                const msg = 'No project root found';
                outputChannel.appendLine(`Error: ${msg}`);
                vscode.window.showErrorMessage(msg);
                return;
            }
            
            outputChannel.appendLine(`Project root: ${projectRoot}`);
            
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating all analyses...",
                    cancellable: false
                }, async (progress) => {
                    // Generate Call Graph
                    progress.report({ message: "Generating call graph..." });
                    outputChannel.appendLine('Generating call graph...');
                    try {
                        const callGraphResult = await client!.sendRequest('workspace/executeCommand', {
                            command: 'traverse.generateCallGraph.workspace',
                            arguments: [{ workspace_folder: projectRoot }]
                        });
                        handleDiagramResult(callGraphResult, 'Call Graph');
                    } catch (error: any) {
                        outputChannel.appendLine(`Call graph error: ${error.message}`);
                    }
                    
                    // Generate Sequence Diagram
                    progress.report({ message: "Generating sequence diagram..." });
                    outputChannel.appendLine('Generating sequence diagram...');
                    try {
                        const sequenceResult = await client!.sendRequest('workspace/executeCommand', {
                            command: 'traverse.generateSequenceDiagram.workspace',
                            arguments: [{ workspace_folder: projectRoot }]
                        });
                        handleDiagramResult(sequenceResult, 'Sequence Diagram');
                    } catch (error: any) {
                        outputChannel.appendLine(`Sequence diagram error: ${error.message}`);
                    }
                    
                    // Generate Storage Analysis
                    progress.report({ message: "Generating storage analysis..." });
                    outputChannel.appendLine('Generating storage analysis...');
                    try {
                        const storageResult = await client!.sendRequest('workspace/executeCommand', {
                            command: 'traverse.analyzeStorage.workspace',
                            arguments: [{ workspace_folder: projectRoot }]
                        });
                        handleDiagramResult(storageResult, 'Storage Analysis');
                    } catch (error: any) {
                        outputChannel.appendLine(`Storage analysis error: ${error.message}`);
                    }
                });
                
                outputChannel.appendLine('All analyses generation completed');
                
                // Show success message with option to open output folder
                const outputDir = path.join(projectRoot, 'traverse-output');
                const selection = await vscode.window.showInformationMessage(
                    'All analyses generated successfully',
                    'Open Output Folder'
                );
                if (selection === 'Open Output Folder') {
                    vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(outputDir));
                }
            } catch (error: any) {
                outputChannel.appendLine(`Error: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to generate all analyses: ${error.message}`);
            }
        }
    );
    
    const generateStorageAnalysis = vscode.commands.registerCommand(
        'traverse.generateStorageAnalysis',
        async (uri?: vscode.Uri) => {
            outputChannel.appendLine('Command: Generate Storage Analysis');
            outputChannel.show(true);
            
            // Ensure LSP client is available
            if (!await ensureLSPClient(context)) {
                outputChannel.appendLine('LSP server not available - command cancelled');
                return;
            }
            
            const clickedPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const projectRoot = findProjectRoot(clickedPath);
            if (!projectRoot) {
                const msg = 'No project root found';
                outputChannel.appendLine(`Error: ${msg}`);
                vscode.window.showErrorMessage(msg);
                return;
            }
            
            outputChannel.appendLine(`Project root: ${projectRoot}`);
            
            try {
                const result = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating storage analysis...",
                    cancellable: false
                }, async () => {
                    outputChannel.appendLine('Sending request to LSP server...');
                    return await client!.sendRequest('workspace/executeCommand', {
                        command: 'traverse.analyzeStorage.workspace',
                        arguments: [{ workspace_folder: projectRoot }]
                    });
                });
                
                outputChannel.appendLine('Received response from server');
                handleDiagramResult(result, 'Storage Analysis');
            } catch (error: any) {
                outputChannel.appendLine(`Error: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to analyze storage: ${error.message}`);
            }
        }
    );
    
    const restartCommand = vscode.commands.registerCommand(
        'traverse.restart',
        async () => {
            outputChannel.appendLine('Command: Restart Language Server');
            outputChannel.show(true);
            
            if (!client) {
                outputChannel.appendLine('Server not running, attempting to start...');
                await ensureLSPClient(context);
                return;
            }
            
            try {
                outputChannel.appendLine('Stopping server...');
                await client.stop();
                client = undefined;
                outputChannel.appendLine('Server stopped, restarting...');
                await initializeServer(context);
                vscode.window.showInformationMessage('Traverse LSP server restarted');
            } catch (error: any) {
                outputChannel.appendLine(`Error restarting: ${error.message}`);
                vscode.window.showErrorMessage(`Failed to restart server: ${error.message}`);
            }
        }
    );
    
    const downloadServerCommand = vscode.commands.registerCommand(
        'traverse.downloadServer',
        async () => {
            outputChannel.appendLine('Command: Download Language Server');
            outputChannel.show(true);
            
            const downloader = new Downloader(context);
            outputChannel.appendLine('Starting download process...');
            const downloadPath = await downloader.downloadLatestBinary();
            
            if (downloadPath) {
                outputChannel.appendLine(`Downloaded successfully to: ${downloadPath}`);
                const action = await vscode.window.showInformationMessage(
                    'Server downloaded successfully. Start the language server now?',
                    'Start',
                    'Later'
                );
                
                if (action === 'Start') {
                    outputChannel.appendLine('Starting server with downloaded binary...');
                    if (client) {
                        await client.stop();
                        client = undefined;
                    }
                    await startLanguageServer(context, downloadPath);
                }
            } else {
                outputChannel.appendLine('Download failed or cancelled');
            }
        }
    );
    
    context.subscriptions.push(
        generateCallGraph,
        generateSequenceDiagram,
        generateStorageAnalysis,
        generateAllAnalyses,
        restartCommand,
        downloadServerCommand
    );
}

/**
 * Handle diagram generation results by saving to workspace
 */
function handleDiagramResult(result: any, title: string) {
    outputChannel.appendLine(`Handling result for ${title}`);
    
    if (!result || !result.success) {
        outputChannel.appendLine(`Failed to generate ${title} - no result or success=false`);
        vscode.window.showErrorMessage(`Failed to generate ${title}`);
        return;
    }

    // Get workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        outputChannel.appendLine('No workspace folder found for saving results');
        vscode.window.showErrorMessage('No workspace folder found');
        return;
    }

    // Create timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    
    // Determine output directory based on diagram type
    let outputDir = '';
    const baseDir = path.join(workspaceFolder.uri.fsPath, 'traverse-output');
    
    if (title.toLowerCase().includes('call graph')) {
        outputDir = path.join(baseDir, 'call-graphs');
    } else if (title.toLowerCase().includes('sequence')) {
        outputDir = path.join(baseDir, 'sequence-diagrams');
    } else if (title.toLowerCase().includes('storage')) {
        outputDir = path.join(baseDir, 'storage-reports');
    } else {
        outputDir = path.join(baseDir, 'diagrams');
    }

    outputChannel.appendLine(`Output directory: ${outputDir}`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        outputChannel.appendLine('Created output directory');
    }

    const savedFiles: string[] = [];
    
    // Handle multi-format response (data contains dot and/or mermaid)
    if (result.data) {
        // Save DOT format if available
        if (result.data.dot) {
            const dotFile = path.join(outputDir, `${title.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.dot`);
            fs.writeFileSync(dotFile, result.data.dot);
            savedFiles.push(dotFile);
            outputChannel.appendLine(`Saved DOT file: ${dotFile}`);
        }
        
        // Save Mermaid format if available
        if (result.data.mermaid) {
            const mermaidFile = path.join(outputDir, `${title.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.mmd`);
            fs.writeFileSync(mermaidFile, result.data.mermaid);
            savedFiles.push(mermaidFile);
            outputChannel.appendLine(`Saved Mermaid file: ${mermaidFile}`);
        }
    } 
    // Handle single-format response (backward compatibility)
    else if (result.diagram) {
        let extension = '.md';
        
        // Detect format from content
        if (result.diagram.includes('digraph') || result.diagram.includes('strict graph')) {
            extension = '.dot';
        } else if (result.diagram.includes('sequenceDiagram') || 
                   result.diagram.includes('graph TD') || 
                   result.diagram.includes('graph LR') ||
                   result.diagram.includes('flowchart')) {
            extension = '.mmd';
        }
        
        const filename = path.join(outputDir, `${title.toLowerCase().replace(/\s+/g, '-')}-${timestamp}${extension}`);
        fs.writeFileSync(filename, result.diagram);
        savedFiles.push(filename);
        outputChannel.appendLine(`Saved diagram file: ${filename}`);
    }

    // Show notification with file locations
    if (savedFiles.length > 0) {
        const fileList = savedFiles.map(f => path.relative(workspaceFolder.uri.fsPath, f)).join('\n');
        outputChannel.appendLine(`Successfully saved ${savedFiles.length} file(s)`);
        
        vscode.window.showInformationMessage(
            `${title} saved to:\n${fileList}`,
            'Open Folder',
            'Open Files'
        ).then(selection => {
            if (selection === 'Open Folder') {
                // Open the output directory in explorer
                vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(outputDir));
            } else if (selection === 'Open Files') {
                // Open all generated files
                savedFiles.forEach(file => {
                    vscode.workspace.openTextDocument(file).then(doc => {
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, false);
                    });
                });
            }
        });
    } else {
        outputChannel.appendLine('No files were saved - no diagram data in response');
    }
}

export function deactivate(): Thenable<void> | undefined {
    outputChannel?.appendLine('Extension deactivating...');
    if (!client) {
        return undefined;
    }
    return client.stop();
}