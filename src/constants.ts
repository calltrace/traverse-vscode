import * as vscode from 'vscode';

const platformMappings: Record<string, string> = {
    darwin: "apple-darwin",
    linux: "unknown-linux-gnu",
    win32: "pc-windows-msvc",
};

const archMappings: Record<string, string> = {
    arm64: "aarch64",
    x64: "x86_64",
};

export const CONSTANTS = {
    binaryName: `traverse-lsp${process.platform === "win32" ? ".exe" : ""}`,
    
    platformIdentifier: `${process.platform}-${process.arch}`,
    
    globalStorageFolderForBinary: "bin",
    
    platformSpecificAssetName: (() => {
        let assetName = "traverse-lsp";
        
        const arch = archMappings[process.arch];
        if (arch) {
            assetName += `-${arch}`;
        }
        
        const platform = platformMappings[process.platform];
        if (platform) {
            assetName += `-${platform}`;
        }
        
        if (process.platform === "win32") {
            assetName += ".exe";
        }
        
        return assetName;
    })(),
    
    isCurrentPlatformSupported: (): boolean => {
        return !!(platformMappings[process.platform] && archMappings[process.arch]);
    },
    
    githubRepo: "calltrace/traverse-lsp",
};