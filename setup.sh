#!/bin/bash

echo "Setting up Astro MCP Server..."

echo "Installing npm dependencies..."
npm install

echo "Building TypeScript..."
npm run build

echo ""
echo "✅ Setup complete!"
echo ""
echo "The server uses WebAssembly Swiss Ephemeris - no data files needed!"
echo ""
echo "Next steps:"
echo "1. Add this server to your MCP settings"
echo "2. Use set_natal_chart to store birth data"
echo "3. Query transits with your AI agent"
echo ""
echo "See README.md for detailed usage instructions."
