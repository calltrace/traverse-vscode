#!/bin/bash

# Build script for Traverse VSCode Extension (without embedded binaries)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
EXTENSION_DIR="$(pwd)"
VERSION=$(grep '"version"' package.json | cut -d '"' -f 4)

echo -e "${GREEN}=== Traverse VSCode Extension Build Script ===${NC}"
echo "Version: $VERSION"
echo ""

# Step 1: Pre-flight checks
echo -e "${YELLOW}Step 1: Pre-flight checks${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo -e "${RED}Error: Not in vscode extension directory${NC}"
    exit 1
fi

# Check required tools
command -v npm >/dev/null 2>&1 || { echo -e "${RED}Error: npm not found${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}Error: node not found${NC}"; exit 1; }

echo -e "${GREEN}✓ Pre-flight checks passed${NC}"
echo ""

# Step 2: Clean previous builds
echo -e "${YELLOW}Step 2: Cleaning previous builds${NC}"
rm -rf out/ *.vsix
echo -e "${GREEN}✓ Cleaned previous builds${NC}"
echo ""

# Step 3: Build extension
echo -e "${YELLOW}Step 3: Building extension${NC}"

# Install dependencies
echo "Installing dependencies..."
npm install

# Compile TypeScript
echo "Compiling TypeScript..."
npm run compile

if [ ! -d "out" ]; then
    echo -e "${RED}Error: TypeScript compilation failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Extension built successfully${NC}"
echo ""

# Step 4: Package extension
echo -e "${YELLOW}Step 4: Packaging extension${NC}"

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    echo "Installing vsce..."
    npm install -g @vscode/vsce
fi

# Package the extension (without dependencies to keep size small)
echo "Creating .vsix package..."
vsce package --no-dependencies

# Find the generated .vsix file
VSIX_FILE=$(ls *.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo -e "${RED}Error: Failed to create .vsix package${NC}"
    exit 1
fi

# Get package size
PACKAGE_SIZE=$(ls -lh "$VSIX_FILE" | awk '{print $5}')

echo -e "${GREEN}✓ Extension packaged successfully${NC}"
echo ""

# Step 5: Summary
echo -e "${GREEN}=== Build Complete ===${NC}"
echo "Package: $VSIX_FILE"
echo "Size: $PACKAGE_SIZE (no embedded binaries)"
echo ""
echo "To install the extension, run:"
echo -e "${YELLOW}  code --install-extension $VSIX_FILE${NC}"
echo ""
echo "Note: The LSP server binary will be downloaded automatically on first use."
echo "      Users can also manually download it using the command:"
echo "      'Traverse: Download Language Server'"
echo ""

# Generate build info
cat > build-info.txt << EOF
Traverse VSCode Extension Build Info
=====================================
Date: $(date)
Version: $VERSION
Package: $VSIX_FILE
Package Size: $PACKAGE_SIZE
Binary Distribution: Download on first use from GitHub releases
EOF

echo "Build info saved to build-info.txt"