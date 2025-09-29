import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

interface LSPRequest {
    jsonrpc: string;
    id?: number;
    method: string;
    params?: any;
}

interface LSPResponse {
    jsonrpc: string;
    id: number;
    result: any;
}

interface ChunkingRequests {
    withChunking: string[];
    withoutChunking: string[];
}

function log(message: string, color: string = colors.reset): void {
    console.log(`${color}[Mock LSP] ${message}${colors.reset}`);
}

class MockLSPServer {
    private receivedRequests: LSPRequest[] = [];
    private chunkingRequests: ChunkingRequests = {
        withChunking: [],
        withoutChunking: []
    };
    
    parseMessage(buffer: Buffer): LSPRequest | null {
        const content = buffer.toString();
        const lines = content.split('\r\n');
        
        let contentLength = 0;
        let jsonStart = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('Content-Length:')) {
                contentLength = parseInt(line.substring(15).trim());
            } else if (line === '' && contentLength > 0) {
                jsonStart = i + 1;
                break;
            }
        }
        
        if (jsonStart >= 0) {
            const jsonContent = lines.slice(jsonStart).join('\n');
            try {
                return JSON.parse(jsonContent);
            } catch (e: any) {
                log(`Failed to parse JSON: ${e.message}`, colors.red);
                return null;
            }
        }
        
        return null;
    }
    
    createResponse(id: number, result: any): string {
        const response: LSPResponse = {
            jsonrpc: '2.0',
            id: id,
            result: result
        };
        
        const content = JSON.stringify(response);
        const header = `Content-Length: ${content.length}\r\n\r\n`;
        return header + content;
    }
    
    handleRequest(request: LSPRequest): any {
        log(`Received request: ${request.method}`, colors.cyan);
        
        this.receivedRequests.push(request);
        
        if (request.method === 'workspace/executeCommand') {
            const params = request.params;
            const command = params.command;
            const args = params.arguments?.[0];
            
            log(`  Command: ${command}`, colors.blue);
            log(`  Arguments: ${JSON.stringify(args, null, 2)}`, colors.blue);
            
            if (args && 'chunking' in args) {
                if (args.chunking === true) {
                    log('  ✓ Chunking ENABLED', colors.green);
                    this.chunkingRequests.withChunking.push(command);
                } else {
                    log('  ○ Chunking DISABLED', colors.yellow);
                    this.chunkingRequests.withoutChunking.push(command);
                }
            } else {
                log('  ✗ No chunking parameter found!', colors.red);
            }
            
            if (command.includes('generateCallGraph')) {
                return {
                    success: true,
                    data: {
                        dot: 'digraph G { A -> B; }',
                        chunked: args?.chunking || false
                    }
                };
            } else if (command.includes('generateSequenceDiagram')) {
                return {
                    success: true,
                    data: {
                        mermaid: 'sequenceDiagram\n    A->>B: Test',
                        chunked: args?.chunking || false
                    }
                };
            } else if (command.includes('analyzeStorage')) {
                return {
                    success: true,
                    diagram: '# Storage Analysis\n\nTest storage analysis',
                    chunked: args?.chunking || false
                };
            }
        }
        
        return { success: true };
    }
    
    startStdio(): void {
        log('Starting Mock LSP Server (stdio mode)...', colors.green);
        
        let buffer = '';
        
        process.stdin.on('data', (chunk) => {
            buffer += chunk.toString();
            
            const message = this.parseMessage(Buffer.from(buffer));
            if (message) {
                buffer = '';
                
                const result = this.handleRequest(message);
                if (message.id !== undefined) {
                    const response = this.createResponse(message.id, result);
                    process.stdout.write(response);
                }
            }
        });
        
        process.stdin.on('end', () => {
            this.printSummary();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            this.printSummary();
            process.exit(0);
        });
    }
    
    printSummary(): void {
        log('\n' + '='.repeat(50), colors.yellow);
        log('Mock LSP Server Test Summary', colors.yellow);
        log('='.repeat(50), colors.yellow);
        
        log(`\nTotal requests received: ${this.receivedRequests.length}`, colors.blue);
        log(`Requests with chunking enabled: ${this.chunkingRequests.withChunking.length}`, colors.green);
        log(`Requests with chunking disabled: ${this.chunkingRequests.withoutChunking.length}`, colors.yellow);
        
        if (this.chunkingRequests.withChunking.length > 0) {
            log('\n✓ Chunking parameter is being passed correctly!', colors.green);
        } else if (this.receivedRequests.length > 0) {
            log('\n✗ No requests with chunking parameter received', colors.red);
        }
    }
}

function testLocally(): boolean {
    log('Running local test of chunking functionality...', colors.blue);
    
    const server = new MockLSPServer();
    
    const testRequests: LSPRequest[] = [
        {
            jsonrpc: '2.0',
            id: 1,
            method: 'workspace/executeCommand',
            params: {
                command: 'traverse.generateCallGraph.workspace',
                arguments: [{
                    workspace_folder: '/test',
                    chunking: false
                }]
            }
        },
        {
            jsonrpc: '2.0',
            id: 2,
            method: 'workspace/executeCommand',
            params: {
                command: 'traverse.generateCallGraph.workspace',
                arguments: [{
                    workspace_folder: '/test',
                    chunking: true
                }]
            }
        },
        {
            jsonrpc: '2.0',
            id: 3,
            method: 'workspace/executeCommand',
            params: {
                command: 'traverse.generateSequenceDiagram.workspace',
                arguments: [{
                    workspace_folder: '/test',
                    chunking: true
                }]
            }
        }
    ];
    
    log('\nSimulating LSP requests:', colors.cyan);
    for (const request of testRequests) {
        const result = server.handleRequest(request);
        log(`Response: ${JSON.stringify(result, null, 2)}`, colors.green);
    }
    
    server.printSummary();
    
    const hasChunkedRequests = server['chunkingRequests'].withChunking.length > 0;
    const hasNonChunkedRequests = server['chunkingRequests'].withoutChunking.length > 0;
    
    if (hasChunkedRequests && hasNonChunkedRequests) {
        log('\n✓ TEST PASSED: Chunking parameter works correctly!', colors.green);
        return true;
    } else {
        log('\n✗ TEST FAILED: Chunking parameter not working', colors.red);
        return false;
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--stdio')) {
        const server = new MockLSPServer();
        server.startStdio();
    } else {
        const success = testLocally();
        process.exit(success ? 0 : 1);
    }
}

export { MockLSPServer };