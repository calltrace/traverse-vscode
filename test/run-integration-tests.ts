import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const TEST_TIMEOUT = 60000;

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

interface TestResults {
    passed: string[];
    failed: string[];
    skipped: string[];
}

interface CommandResult {
    stdout: string;
    stderr: string;
    code: number;
}

function log(message: string, color: string = colors.reset): void {
    console.log(`${color}${message}${colors.reset}`);
}

function createTestWorkspace(): string {
    const testDir = path.join(process.cwd(), 'test-workspace');
    
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }
    
    const simpleStorage = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 public storedData;
    
    event DataStored(uint256 data);
    
    function set(uint256 x) public {
        storedData = x;
        emit DataStored(x);
    }
    
    function get() public view returns (uint256) {
        return storedData;
    }
    
    function increment() public {
        storedData = storedData + 1;
    }
}`;

    const token = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Token {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    
    constructor(uint256 _initialSupply) {
        totalSupply = _initialSupply;
        balances[msg.sender] = _initialSupply;
    }
    
    function transfer(address to, uint256 amount) public returns (bool) {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }
}`;

    fs.writeFileSync(path.join(testDir, 'SimpleStorage.sol'), simpleStorage);
    fs.writeFileSync(path.join(testDir, 'Token.sol'), token);
    
    const packageJson = {
        name: "test-solidity-project",
        version: "1.0.0",
        description: "Test Solidity project for Traverse VSCode extension"
    };
    
    fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
    );
    
    return testDir;
}

async function runCommand(command: string, args: string[] = [], cwd: string = process.cwd()): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { 
            cwd, 
            shell: process.platform === 'win32',
            stdio: 'pipe'
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
            }
        });
        
        proc.on('error', (err) => {
            reject(err);
        });
        
        setTimeout(() => {
            proc.kill();
            reject(new Error(`Command timed out after ${TEST_TIMEOUT}ms`));
        }, TEST_TIMEOUT);
    });
}

async function testExtensionCommands(): Promise<void> {
    const testResults: TestResults = {
        passed: [],
        failed: [],
        skipped: []
    };
    
    try {
        log('Setting up test workspace...', colors.blue);
        const testDir = createTestWorkspace();
        log(`Test workspace created at: ${testDir}`, colors.green);
        
        log('\nTesting extension compilation...', colors.blue);
        try {
            await runCommand('npm', ['run', 'compile']);
            log('✓ Extension compiled successfully', colors.green);
            testResults.passed.push('Extension compilation');
        } catch (error: any) {
            log(`✗ Extension compilation failed: ${error.message}`, colors.red);
            testResults.failed.push('Extension compilation');
        }
        
        log('\nTesting extension packaging...', colors.blue);
        try {
            await runCommand('npm', ['run', 'package']);
            log('✓ Extension packaged successfully', colors.green);
            testResults.passed.push('Extension packaging');
        } catch (error: any) {
            log(`✗ Extension packaging failed: ${error.message}`, colors.red);
            testResults.failed.push('Extension packaging');
        }
        
        log('\nTesting LSP command structures...', colors.blue);
        
        const commands = [
            'traverse.generateCallGraph',
            'traverse.generateSequenceDiagram',
            'traverse.generateStorageAnalysis',
            'traverse.generateAllAnalyses',
            'traverse.toggleChunking',
            'traverse.restart',
            'traverse.downloadServer'
        ];
        
        const extensionPath = path.join(process.cwd(), 'src', 'extension.ts');
        if (fs.existsSync(extensionPath)) {
            const extensionContent = fs.readFileSync(extensionPath, 'utf8');
            
            for (const cmd of commands) {
                if (extensionContent.includes(`'${cmd}'`)) {
                    log(`✓ Command '${cmd}' is registered`, colors.green);
                    testResults.passed.push(`Command: ${cmd}`);
                } else {
                    log(`✗ Command '${cmd}' not found in extension`, colors.red);
                    testResults.failed.push(`Command: ${cmd}`);
                }
            }
        }
        
        log('\nTesting chunking configuration...', colors.blue);
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (packageJson.contributes?.configuration?.properties?.['traverse-lsp.enableChunking']) {
            log('✓ Chunking configuration found in package.json', colors.green);
            testResults.passed.push('Chunking configuration');
            
            const chunkingConfig = packageJson.contributes.configuration.properties['traverse-lsp.enableChunking'];
            if (chunkingConfig.type === 'boolean' && chunkingConfig.default === false) {
                log('✓ Chunking configuration has correct type and default value', colors.green);
                testResults.passed.push('Chunking configuration validation');
            }
        } else {
            log('✗ Chunking configuration not found in package.json', colors.red);
            testResults.failed.push('Chunking configuration');
        }
        
        log('\nTesting output directory structure...', colors.blue);
        const outputDir = path.join(testDir, 'traverse-output');
        const expectedDirs = ['call-graphs', 'sequence-diagrams', 'storage-reports'];
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        for (const dir of expectedDirs) {
            const dirPath = path.join(outputDir, dir);
            fs.mkdirSync(dirPath, { recursive: true });
            
            if (fs.existsSync(dirPath)) {
                log(`✓ Output directory '${dir}' can be created`, colors.green);
                testResults.passed.push(`Output directory: ${dir}`);
            }
        }
        
    } catch (error: any) {
        log(`\nUnexpected error during testing: ${error.message}`, colors.red);
        testResults.failed.push(`Unexpected error: ${error.message}`);
    }
    
    log('\n' + '='.repeat(50), colors.yellow);
    log('TEST SUMMARY', colors.yellow);
    log('='.repeat(50), colors.yellow);
    
    log(`\nPassed: ${testResults.passed.length}`, colors.green);
    testResults.passed.forEach(test => {
        log(`  ✓ ${test}`, colors.green);
    });
    
    if (testResults.failed.length > 0) {
        log(`\nFailed: ${testResults.failed.length}`, colors.red);
        testResults.failed.forEach(test => {
            log(`  ✗ ${test}`, colors.red);
        });
    }
    
    if (testResults.skipped.length > 0) {
        log(`\nSkipped: ${testResults.skipped.length}`, colors.yellow);
        testResults.skipped.forEach(test => {
            log(`  ○ ${test}`, colors.yellow);
        });
    }
    
    const exitCode = testResults.failed.length > 0 ? 1 : 0;
    log(`\nTests ${exitCode === 0 ? 'PASSED' : 'FAILED'}`, exitCode === 0 ? colors.green : colors.red);
    
    process.exit(exitCode);
}

if (require.main === module) {
    log('Starting Traverse VSCode Extension Integration Tests\n', colors.blue);
    testExtensionCommands().catch(error => {
        log(`Fatal error: ${error.message}`, colors.red);
        process.exit(1);
    });
}

export { testExtensionCommands, createTestWorkspace };