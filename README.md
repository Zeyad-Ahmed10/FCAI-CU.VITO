# FCAI-CU (نسخة بدون سيرفر ولا تسجيل دخول)

موقع ثابت (HTML) على Vercel/GitHub. أي حد يفتحه يشوف المواد من غير حساب.
المواد متسجلة في `content.json` والملفات المرفوعة في فولدر `files/`.

## إضافة مواد (على جهازك)
1. نزّل Node.js من nodejs.org (مرة واحدة).
2. دوس دبل كليك على `start-admin.bat` (أو: `node admin/server.js`).
3. هيفتح `http://localhost:3000/admin`: ضيف كورسات وأقسام ومواد (من الجهاز أو رابط درايف).
4. اقفل النافذة السودا لما تخلص.

## النشر
- ارفع الفولدر على GitHub (أسهل طريقة: GitHub Desktop)، واربطه بـ Vercel (Framework: Other).
- بعد كل تعديل: Commit & Push لـ `content.json` و`files/`، وVercel يحدّث الموقع تلقائي في دقيقة.

## حدود
- ملفات GitHub: لحد 100MB بـ git/GitHub Desktop (25MB لو رفع من المتصفح). الفيديوهات الكبيرة: رابط درايف/يوتيوب.
