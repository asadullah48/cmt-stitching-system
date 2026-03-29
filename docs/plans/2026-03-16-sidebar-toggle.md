# Sidebar Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a VS Code-style sidebar toggle — a top bar with a ☰ hamburger button and the current page name, so users can collapse/expand the sidebar.

**Architecture:** Single file change to `frontend/src/app/(dashboard)/layout.tsx`. State is a `sidebarOpen` boolean stored in `localStorage` (key: `sidebar-open`, default `true`). The sidebar slides in/out via CSS `translate-x` transition. The top bar is a fixed strip that shifts right when the sidebar is open. Main content gets `pt-10` to clear the top bar.

**Tech Stack:** Next.js 15, TailwindCSS v4, TypeScript, React `useState`/`useEffect`

---

### Task 1: Sidebar toggle with friendly top bar

**Files:**
- Modify: `frontend/src/app/(dashboard)/layout.tsx`

No automated tests exist for layout components — verify manually in the browser.

---

**Step 1: Add `sidebarOpen` state to `DashboardLayout`**

Inside `DashboardLayout`, before the loading checks, add:

```tsx
const [sidebarOpen, setSidebarOpen] = React.useState(true);

// Initialise from localStorage after mount (avoids SSR mismatch)
React.useEffect(() => {
  const stored = localStorage.getItem("sidebar-open");
  if (stored !== null) setSidebarOpen(stored === "true");
}, []);

// Persist every change
React.useEffect(() => {
  localStorage.setItem("sidebar-open", String(sidebarOpen));
}, [sidebarOpen]);
```

---

**Step 2: Pass `sidebarOpen` into `Sidebar` and add slide transition**

Change `Sidebar` signature to accept a prop:

```tsx
function Sidebar({ open }: { open: boolean }) {
```

Update the `<aside>` opening tag — add transition classes and conditional translate:

```tsx
<aside
  className={cn(
    "fixed top-0 left-0 h-screen w-60 bg-[#1a2744] flex flex-col z-40 transition-transform duration-200",
    open ? "translate-x-0" : "-translate-x-full"
  )}
>
```

Update the render call in `DashboardLayout`:

```tsx
<Sidebar open={sidebarOpen} />
```

---

**Step 3: Build the top bar**

Add this component above `Sidebar` in the file (uses `NAV_ITEMS` to derive page title):

```tsx
function TopBar({
  sidebarOpen,
  onToggle,
}: {
  sidebarOpen: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  const pageTitle =
    NAV_ITEMS.find(
      (item) =>
        item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname === item.href || pathname.startsWith(item.href + "/")
    )?.label ?? "CMT System";

  return (
    <header
      className={cn(
        "fixed top-0 right-0 h-10 bg-white border-b border-gray-200 flex items-center gap-3 px-3 z-30 transition-all duration-200",
        sidebarOpen ? "left-60" : "left-0"
      )}
    >
      <button
        onClick={onToggle}
        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="text-sm font-medium text-gray-700">{pageTitle}</span>
    </header>
  );
}
```

---

**Step 4: Wire top bar + adjust main content padding**

In `DashboardLayout` return, replace the current JSX with:

```tsx
return (
  <div className="min-h-screen bg-gray-50">
    <div className="print:hidden">
      <TopBar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} />
      <Sidebar open={sidebarOpen} />
    </div>
    <main
      className={cn(
        "pt-10 transition-all duration-200 print:pt-0 print:pl-0",
        sidebarOpen ? "pl-60" : "pl-0"
      )}
    >
      <div className="max-w-7xl mx-auto px-6 py-6 print:p-0 print:max-w-full">
        {children}
      </div>
    </main>
    <QuickAddTodo />
  </div>
);
```

---

**Step 5: Verify in browser**

1. `cd frontend && npm run dev`
2. Open `http://localhost:3000/dashboard`
3. Click ☰ — sidebar slides out, content expands to full width
4. Click ☰ again — sidebar slides back in
5. Refresh page — state is restored from localStorage
6. Check top bar shows correct page name on each route
7. Check print layout is unaffected (`print:hidden` / `print:pl-0`)

---

**Step 6: Commit**

```bash
git add "frontend/src/app/(dashboard)/layout.tsx"
git commit -m "feat: add sidebar toggle with top bar and page title"
```
