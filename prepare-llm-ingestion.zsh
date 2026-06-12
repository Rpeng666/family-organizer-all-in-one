#!/usr/bin/env zsh

OUT="llm-context.txt"

echo "Creating $OUT from tracked source files..."

# File types to include (top-level rule)
BASE_FILES=(
  '*.ts'
  '*.tsx'
  '*.js'
  '*.jsx'
  '*.css'
  '*.md'
  '*.json'
)

# Collect base files (tracked) EXCLUDING components/ui for now
FILES=$(git ls-files $BASE_FILES | grep -v '^components/ui/')

# Now ADD BACK only UPPERCASE-starting ui components
UI_CAP_FILES=$(git ls-files 'components/ui/*' | grep '/[A-Z][^/]*$')

# Combine lists
ALL_FILES=$(printf "%s\n%s\n" "$FILES" "$UI_CAP_FILES")

# Apply exclusions:
# 1. Exclude package*.json
# 2. Exclude *-old.*
ALL_FILES=$(echo "$ALL_FILES" |
  grep -v 'package.*\.json$' |
  grep -v '\-old\.' |
  grep -v '\.old$' |
  grep -v '\.old\.[^.]*$'
)

# Clear output file safely
printf "" | tee "$OUT" > /dev/null

echo "$ALL_FILES" | while read -r file; do
  # Skip empty lines
  [[ -z "$file" ]] && continue

  # Get file size (bytes — portable for macOS)
  size=$(stat -f "%z" "$file" 2>/dev/null)

  echo "Adding $file (${size} bytes)" >&2

  {
    echo "===== FILE: $file ====="
    cat "$file"
    echo
    echo
  } >> "$OUT"
done

echo "Done. Output written to $OUT"
