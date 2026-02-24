# ✅ Frontend daily checklist (AAWE)

Run these in VS Code terminal(s):

1. Start dev server on strict port 5176
```powershell
cd C:\Users\Ciaran\Desktop\research_os\frontend
npm run dev -- --port 5176 --strictPort
```

2. Start Storybook
```powershell
cd C:\Users\Ciaran\Desktop\research_os\frontend
npm run storybook
```

3. Run checks
```powershell
cd C:\Users\Ciaran\Desktop\research_os\frontend
npm run check
```

4. Run E2E smoke test (`publications.spec.ts`)
```powershell
cd C:\Users\Ciaran\Desktop\research_os\frontend
npm run test:e2e -- tests/e2e/publications.spec.ts
```
