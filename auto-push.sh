#!/bin/bash

# Auto-push script for BTC Multi-Timeframe Analysis project
# Usage: ./auto-push.sh "commit message"

echo "🚀 Auto-push script for BTC Multi-Timeframe Analysis"
echo "=================================================="

# Check if commit message is provided
if [ -z "$1" ]; then
    echo "❌ Error: Please provide a commit message"
    echo "Usage: ./auto-push.sh \"your commit message\""
    exit 1
fi

COMMIT_MESSAGE="$1"

echo "📝 Commit message: $COMMIT_MESSAGE"
echo ""

# Check git status
echo "🔍 Checking git status..."
git status --porcelain

if [ $? -eq 0 ] && [ -z "$(git status --porcelain)" ]; then
    echo "✅ No changes to commit"
    exit 0
fi

# Add all changes
echo "📦 Adding all changes..."
git add .

# Commit with provided message
echo "💾 Committing changes..."
git commit -m "$COMMIT_MESSAGE"

# Push to GitHub
echo "🚀 Pushing to GitHub..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🌐 Repository: https://github.com/tomtodak/btc"
    echo ""
    echo "📋 Recent commits:"
    git log --oneline -5
else
    echo "❌ Error pushing to GitHub"
    exit 1
fi 