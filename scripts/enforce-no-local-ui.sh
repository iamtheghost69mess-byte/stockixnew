#!/bin/bash
# Enforce that no new `components/ui/` folders are created
# This ensures developers use @repo/ui-core or @repo/ui-shared instead.

echo "Checking for localized UI components..."

# Find all components/ui folders inside apps or services
LOCAL_UI_FOLDERS=$(find apps services -type d -path "*/components/ui" -not -path "*/node_modules/*" 2>/dev/null)

if [ -n "$LOCAL_UI_FOLDERS" ]; then
  echo "❌ ERROR: Localized components/ui/ folders detected!"
  echo "The following localized UI folders violate the unified UI architecture:"
  echo "$LOCAL_UI_FOLDERS"
  echo ""
  echo "Please use @repo/ui-core or @repo/ui-shared instead of localized Shadcn components."
  exit 1
fi

echo "✅ No localized UI components found. Architecture compliance verified."
exit 0
