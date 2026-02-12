#!/bin/bash
# Automated migration script: Railway → Supabase
# Runs all batches for each table until done

BASE_URL="${1:-http://localhost:3000}"
TABLES=("propostas" "proposta_apoiadores" "proposta_emendas")
BATCH=50000

echo "=== Railway → Supabase Migration ==="
echo "Server: $BASE_URL"
echo ""

# Check status first
echo "--- Current Status ---"
curl -s "$BASE_URL/api/migrate" | python3 -m json.tool 2>/dev/null
echo ""

for TABLE in "${TABLES[@]}"; do
  echo "=== Migrating: $TABLE ==="
  OFFSET=0
  TOTAL=0

  while true; do
    echo -n "  Batch offset=$OFFSET ... "
    RESULT=$(curl -s "$BASE_URL/api/migrate?table=$TABLE&offset=$OFFSET&batch=$BATCH")

    DONE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('done',False))" 2>/dev/null)
    FETCHED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('fetched',0))" 2>/dev/null)
    ERROR=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)

    if [ -n "$ERROR" ] && [ "$ERROR" != "" ]; then
      echo "ERROR: $ERROR"
      echo "  Retrying in 5s..."
      sleep 5
      continue
    fi

    TOTAL=$((TOTAL + FETCHED))
    echo "fetched=$FETCHED total=$TOTAL done=$DONE"

    if [ "$DONE" = "True" ] || [ "$DONE" = "true" ]; then
      echo "  ✅ $TABLE complete! Total: $TOTAL rows"
      break
    fi

    OFFSET=$((OFFSET + BATCH))
    sleep 1
  done
  echo ""
done

echo "=== Final Status ==="
curl -s "$BASE_URL/api/migrate" | python3 -m json.tool 2>/dev/null
echo ""
echo "✅ Migration complete!"
