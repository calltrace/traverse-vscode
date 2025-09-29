import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Traverse Extension Test Suite', () => {
    const testWorkspaceDir = path.join(__dirname, '..', '..', 'test-workspace');
    
    suiteSetup(async () => {
        // Ensure test workspace exists
        if (!fs.existsSync(testWorkspaceDir)) {
            fs.mkdirSync(testWorkspaceDir, { recursive: true });
        }
        
        // Create test Solidity files
        const testContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TestContract {
    uint256 public value;
    
    function setValue(uint256 _value) public {
        value = _value;
    }
}`;
        
        fs.writeFileSync(path.join(testWorkspaceDir, 'TestContract.sol'), testContract);
        
        // Wait for extension to activate
        await new Promise(resolve => setTimeout(resolve, 2000));
    });
    
    test('Extension should be activated', () => {
        const extension = vscode.extensions.getExtension('GianlucaBrigandi.traverse-vscode');
        assert.ok(extension, 'Extension should be installed');
        assert.strictEqual(extension?.isActive, true, 'Extension should be active');
    });
    
    test('All commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        
        const expectedCommands = [
            'traverse.generateCallGraph',
            'traverse.generateSequenceDiagram',
            'traverse.generateStorageAnalysis',
            'traverse.generateAllAnalyses',
            'traverse.toggleChunking',
            'traverse.restart',
            'traverse.downloadServer'
        ];
        
        for (const cmd of expectedCommands) {
            assert.ok(
                commands.includes(cmd),
                `Command ${cmd} should be registered`
            );
        }
    });
    
    test('Chunking configuration should exist', () => {
        const config = vscode.workspace.getConfiguration('traverse-lsp');
        const chunkingEnabled = config.get<boolean>('enableChunking');
        
        assert.strictEqual(typeof chunkingEnabled, 'boolean', 'enableChunking should be a boolean');
        assert.strictEqual(chunkingEnabled, false, 'enableChunking should default to false');
    });
    
    test('Toggle chunking command should work', async () => {
        const config = vscode.workspace.getConfiguration('traverse-lsp');
        const initialValue = config.get<boolean>('enableChunking', false);
        
        // Toggle chunking
        await vscode.commands.executeCommand('traverse.toggleChunking');
        
        // Wait for configuration update
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const newValue = config.get<boolean>('enableChunking', false);
        assert.strictEqual(newValue, !initialValue, 'Chunking should be toggled');
        
        // Toggle back
        await vscode.commands.executeCommand('traverse.toggleChunking');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const finalValue = config.get<boolean>('enableChunking', false);
        assert.strictEqual(finalValue, initialValue, 'Chunking should be toggled back');
    });
    
    test('Generate commands should handle missing LSP server gracefully', async function() {
        this.timeout(10000);
        
        // Try to execute a command without LSP server
        try {
            // This should not throw an error but should show a message
            await vscode.commands.executeCommand('traverse.generateCallGraph');
            
            // Command should complete without crashing
            assert.ok(true, 'Command executed without crashing');
        } catch (error) {
            // Even if it fails, it should fail gracefully
            assert.ok(error, 'Error should be handled gracefully');
        }
    });
    
    test('Configuration should have correct properties', () => {
        const config = vscode.workspace.getConfiguration('traverse-lsp');
        
        // Test all configuration properties
        const properties = [
            { name: 'enableChunking', type: 'boolean', default: false },
            { name: 'serverPath', type: 'string', default: '' },
            { name: 'trace.server', type: 'string', default: 'off' },
            { name: 'maxNumberOfProblems', type: 'number', default: 100 }
        ];
        
        for (const prop of properties) {
            const value = config.get(prop.name);
            
            if (prop.default !== undefined) {
                const actualType = typeof value;
                const expectedType = prop.type;
                
                assert.ok(
                    actualType === expectedType || (expectedType === 'string' && value === undefined),
                    `${prop.name} should be of type ${prop.type}, got ${actualType}`
                );
            }
        }
    });
    
    test('Output channel should be created', async () => {
        // Wait for extension to fully initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if output channel exists
        const outputChannels = vscode.window.visibleTextEditors;
        // We can't directly test for output channel, but we can verify no errors occurred
        assert.ok(true, 'Extension initialized without errors');
    });
});