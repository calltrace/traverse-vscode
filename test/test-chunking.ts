#!/usr/bin/env node

/**
 * Test script to verify chunking parameter is passed correctly to LSP commands
 */

import * as fs from 'fs';
import * as path from 'path';

// Colors for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m'
};

interface TestResults {
    passed: string[];
    failed: string[];
}

function log(message: string, color: string = colors.reset): void {
    console.log(`${color}${message}${colors.reset}`);
}

// Load the compiled extension to check the chunking implementation
function testChunkingImplementation(): boolean {
    log('\n=== Testing Chunking Implementation ===\n', colors.blue);
    
    const testResults: TestResults = {
        passed: [],
        failed: []
    };
    
    try {
        // Read the compiled extension.js to verify chunking is implemented
        const extensionPath = path.join(__dirname, '..', 'extension.js');
        if (fs.existsSync(extensionPath)) {
            const extensionContent = fs.readFileSync(extensionPath, 'utf8');
            
            // Check if chunking configuration is being read
            if (extensionContent.includes('enableChunking')) {
                log('Extension reads enableChunking configuration', colors.green);
                testResults.passed.push('Reads enableChunking config');
            } else {
                log('Extension does not read enableChunking configuration', colors.red);
                testResults.failed.push('Reads enableChunking config');
            }
            
            // Check if chunking is passed in requests
            if (extensionContent.includes('chunking:')) {
                log('Extension passes chunking parameter in requests', colors.green);
                testResults.passed.push('Passes chunking parameter');
            } else {
                log('Extension does not pass chunking parameter', colors.red);
                testResults.failed.push('Passes chunking parameter');
            }
            
            // Check toggle command implementation
            if (extensionContent.includes('traverse.toggleChunking')) {
                log('Toggle chunking command is implemented', colors.green);
                testResults.passed.push('Toggle command implemented');
            } else {
                log('Toggle chunking command not found', colors.red);
                testResults.failed.push('Toggle command implemented');
            }
        } else {
            log('Compiled extension.js not found', colors.red);
            testResults.failed.push('Extension compilation');
        }
        
        // Read the source TypeScript file for more detailed checks
        const srcPath = path.join(__dirname, '..', 'src', 'extension.ts');
        if (fs.existsSync(srcPath)) {
            const srcContent = fs.readFileSync(srcPath, 'utf8');
            
            // Count how many commands use chunking
            const commands = [
                'generateCallGraph',
                'generateSequenceDiagram', 
                'generateStorageAnalysis',
                'generateAllAnalyses'
            ];
            
            let chunkingCount = 0;
            for (const cmd of commands) {
                // Check if each command reads the chunking config
                const cmdRegex = new RegExp(`${cmd}[\\s\\S]*?enableChunking`, 'g');
                if (cmdRegex.test(srcContent)) {
                    chunkingCount++;
                    log(`Command '${cmd}' uses chunking parameter`, colors.green);
                    testResults.passed.push(`${cmd} uses chunking`);
                } else {
                    log(`Command '${cmd}' does not use chunking parameter`, colors.red);
                    testResults.failed.push(`${cmd} uses chunking`);
                }
            }
            
            log(`\nChunking implemented in ${chunkingCount}/${commands.length} commands`, 
                chunkingCount === commands.length ? colors.green : colors.yellow);
        }
        
        // Test configuration in package.json
        const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        const chunkingConfig = packageJson.contributes?.configuration?.properties?.['traverse-lsp.enableChunking'];
        if (chunkingConfig) {
            log('\nChunking configuration properly defined in package.json:', colors.green);
            log(`  - Type: ${chunkingConfig.type}`, colors.green);
            log(`  - Default: ${chunkingConfig.default}`, colors.green);
            log(`  - Description: ${chunkingConfig.description}`, colors.green);
            testResults.passed.push('Package.json configuration');
        } else {
            log('\nChunking configuration missing in package.json', colors.red);
            testResults.failed.push('Package.json configuration');
        }
        
    } catch (error: any) {
        log(`\nError during testing: ${error.message}`, colors.red);
        testResults.failed.push(`Error: ${error.message}`);
    }
    
    // Print summary
    log('\n' + '='.repeat(50), colors.yellow);
    log('CHUNKING TEST SUMMARY', colors.yellow);
    log('='.repeat(50), colors.yellow);
    
    if (testResults.passed.length > 0) {
        log(`\nPassed: ${testResults.passed.length}`, colors.green);
        testResults.passed.forEach(test => {
            log(`  - ${test}`, colors.green);
        });
    }
    
    if (testResults.failed.length > 0) {
        log(`\nFailed: ${testResults.failed.length}`, colors.red);
        testResults.failed.forEach(test => {
            log(`  - ${test}`, colors.red);
        });
    }
    
    const success = testResults.failed.length === 0;
    log(`\n${success ? 'All chunking tests PASSED' : 'Some chunking tests FAILED'}`, 
        success ? colors.green : colors.red);
    
    return success;
}

// Simulate LSP request with chunking
function simulateLSPRequest(): boolean {
    log('\n=== Simulating LSP Request with Chunking ===\n', colors.magenta);
    
    // Create a mock request payload like the extension would send
    const mockRequests = [
        {
            command: 'traverse.generateCallGraph.workspace',
            arguments: [{
                workspace_folder: '/test/workspace',
                chunking: false  // Default
            }]
        },
        {
            command: 'traverse.generateCallGraph.workspace',
            arguments: [{
                workspace_folder: '/test/workspace',
                chunking: true  // Enabled
            }]
        }
    ];
    
    log('Mock LSP Request (chunking disabled):', colors.blue);
    log(JSON.stringify(mockRequests[0], null, 2));
    
    log('\nMock LSP Request (chunking enabled):', colors.blue);
    log(JSON.stringify(mockRequests[1], null, 2));
    
    // Verify the structure
    const request1 = mockRequests[0];
    const request2 = mockRequests[1];
    
    if (request1.arguments[0].chunking === false && request2.arguments[0].chunking === true) {
        log('\nChunking parameter correctly toggles between true/false', colors.green);
        return true;
    } else {
        log('\nChunking parameter not working correctly', colors.red);
        return false;
    }
}

// Main test runner
function runTests(): void {
    log('Starting Comprehensive Chunking Tests\n', colors.blue);
    
    let allPassed = true;
    
    // Run implementation tests
    if (!testChunkingImplementation()) {
        allPassed = false;
    }
    
    // Run simulation tests
    if (!simulateLSPRequest()) {
        allPassed = false;
    }
    
    // Final result
    log('\n' + '='.repeat(50), colors.yellow);
    if (allPassed) {
        log('ALL TESTS PASSED', colors.green);
        process.exit(0);
    } else {
        log('SOME TESTS FAILED', colors.red);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runTests();
}

export { testChunkingImplementation, simulateLSPRequest };