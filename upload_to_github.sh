#!/bin/bash
# ============================================================
#  GitHub 자동 업로드 스크립트
#  사용법: bash upload_to_github.sh
# ============================================================

set -e

# ── 1. 설정 입력 ────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   📦 GitHub 자동 업로드 스크립트"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "🔑 GitHub Personal Access Token: " TOKEN
echo ""
read -p "👤 GitHub 사용자명(username): " USERNAME
echo ""
read -p "📁 새 저장소 이름 (예: news-card-studio): " REPO_NAME
echo ""
read -p "📝 저장소 설명 (엔터 시 생략): " REPO_DESC
echo ""
read -p "🌐 공개(public) 저장소로 만들까요? [y/N]: " IS_PUBLIC
echo ""

PRIVATE="true"
if [[ "$IS_PUBLIC" =~ ^[Yy]$ ]]; then
  PRIVATE="false"
fi

FILE_PATH="index.html"
if [ ! -f "$FILE_PATH" ]; then
  echo "❌ index.html 파일을 찾을 수 없습니다."
  exit 1
fi

# ── 2. 저장소 생성 ──────────────────────────────────────────
echo "🚀 저장소 생성 중..."

CREATE_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{
    \"name\": \"$REPO_NAME\",
    \"description\": \"$REPO_DESC\",
    \"private\": $PRIVATE,
    \"auto_init\": false
  }")

HTTP_CODE=$(echo "$CREATE_RESP" | tail -1)
BODY=$(echo "$CREATE_RESP" | head -n -1)

if [ "$HTTP_CODE" != "201" ]; then
  echo "❌ 저장소 생성 실패 (HTTP $HTTP_CODE)"
  echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('오류:', d.get('message','알 수 없는 오류'))" 2>/dev/null || echo "$BODY"
  exit 1
fi

echo "✅ 저장소 생성 완료!"

# ── 3. 파일 Base64 인코딩 ───────────────────────────────────
echo "📄 파일 업로드 중..."

CONTENT=$(base64 -w 0 "$FILE_PATH")

UPLOAD_RESP=$(curl -s -w "\n%{http_code}" \
  -X PUT \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/$USERNAME/$REPO_NAME/contents/$FILE_PATH" \
  -d "{
    \"message\": \"✨ Add news card studio (index.html)\",
    \"content\": \"$CONTENT\"
  }")

HTTP_CODE2=$(echo "$UPLOAD_RESP" | tail -1)
BODY2=$(echo "$UPLOAD_RESP" | head -n -1)

if [ "$HTTP_CODE2" != "201" ]; then
  echo "❌ 파일 업로드 실패 (HTTP $HTTP_CODE2)"
  echo "$BODY2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('오류:', d.get('message','알 수 없는 오류'))" 2>/dev/null || echo "$BODY2"
  exit 1
fi

# ── 4. GitHub Pages 활성화 ──────────────────────────────────
echo "🌐 GitHub Pages 활성화 중..."

PAGES_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/$USERNAME/$REPO_NAME/pages" \
  -d '{"source": {"branch": "main", "path": "/"}}')

HTTP_CODE3=$(echo "$PAGES_RESP" | tail -1)

# ── 5. 완료 출력 ─────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   🎉 업로드 완료!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 저장소:   https://github.com/$USERNAME/$REPO_NAME"
echo "📄 파일:     https://github.com/$USERNAME/$REPO_NAME/blob/main/index.html"

if [ "$HTTP_CODE3" = "201" ] || [ "$HTTP_CODE3" = "200" ]; then
  echo "🌐 Pages URL: https://$USERNAME.github.io/$REPO_NAME/"
  echo ""
  echo "💡 Pages 배포는 1~2분 후 활성화됩니다."
else
  echo ""
  echo "💡 GitHub Pages를 수동으로 켜려면:"
  echo "   저장소 → Settings → Pages → Branch: main → Save"
fi

echo ""
