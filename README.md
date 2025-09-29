# Traverse VSCode Extension (Preview)

[![Tests](https://github.com/calltrace/traverse-vscode/actions/workflows/test.yml/badge.svg)](https://github.com/calltrace/traverse-vscode/actions/workflows/test.yml)
[![Latest Release](https://img.shields.io/github/v/release/calltrace/traverse-vscode)](https://github.com/calltrace/traverse-vscode/releases)
[![Version](https://img.shields.io/github/package-json/v/calltrace/traverse-vscode)](https://github.com/calltrace/traverse-vscode)
![Preview](https://img.shields.io/badge/Status-Preview-orange)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

![Traverse Demo](media/traverse-demo.gif)

Solidity smart contract visualization with automatic call graph and sequence diagram generation.

## Install

### From Marketplace
Install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=GianlucaBrigandi.traverse-vscode) or search for "Traverse Solidity Analyzer" in VS Code Extensions.

### From VSIX
```bash
code --install-extension traverse-vscode-0.1.5.vsix
```

### First Run Setup
On first activation, the extension will prompt you to download the Traverse LSP server binary for your platform. The binary is downloaded from GitHub releases and stored in VS Code's global storage.

**Supported Platforms:**
- macOS (Intel & Apple Silicon)
- Linux (x64 & ARM64)
- Windows (x64)

You can also manually download the server using:
- Command Palette: `Traverse: Download Language Server`
- Or set a custom path in settings: `traverse-lsp.serverPath`

## Usage

1. Open a Solidity project
2. Right-click any folder → Select "Traverse" commands
3. The extension automatically finds your project root and analyzes all contracts
4. Results are saved to `traverse-output/` in your project root

**Note:** Commands always analyze the entire project from the root, regardless of which folder you right-click. The extension automatically detects your project root by looking for common configuration files (foundry.toml, hardhat.config.js, package.json, etc.).

**Available Commands** (Cmd+Shift+P):

- `Generate Call Graph` - Visualize function relationships
- `Generate Sequence Diagram` - Show execution flow
- `Generate Storage Analysis` - Map storage variables and access patterns
- `Generate All Analyses` - Run all analyses at once
- `Toggle Chunking` - Enable/disable output chunking for large codebases

## Security Notice

This extension downloads the Traverse LSP server binary from GitHub releases on first use. The binary is:
- Downloaded over HTTPS from the official GitHub repository
- Stored in VS Code's secure global storage directory
- Made executable only for the current user
- Never executed with elevated privileges

You can inspect the source code at: https://github.com/calltrace/traverse-lsp

## Features

### Call Graph Generation

Generates DOT format graphs showing all function calls and relationships.

### Sequence Diagrams

Creates Mermaid sequence diagrams for contract interactions.

### Storage Analysis

Generates a detailed Markdown report of all storage variables and their access patterns across functions.

## Configuration

The extension can be configured through VS Code settings:

- `traverse-lsp.enableChunking` (default: `false`) - Enable chunking of large analysis outputs for better handling of big codebases
- `traverse-lsp.serverPath` - Custom path to the Traverse LSP server executable
- `traverse-lsp.trace.server` - Enable server communication tracing for debugging
- `traverse-lsp.maxNumberOfProblems` - Maximum number of problems to report

## Known Limitations (Preview)

- Limited support for complex inheritance and Solidity 0.8+ features
- Performance issues with large codebases (>100 contracts)
- Cross-file references are experimental

## Troubleshooting

**Extension not activating?**

- Ensure you have `.sol` files in your workspace
- Check Output panel → "Traverse LSP" for errors

**No diagrams generated?**

- Verify Solidity syntax is valid
- Check `traverse-output/` folder in workspace

**Server crashes?**

- Run `Traverse: Restart Language Server` from command palette

## Feedback

Report issues: https://github.com/calltrace/traverse-vscode/issues
Include: VS Code version, extension version, sample code, error messages
