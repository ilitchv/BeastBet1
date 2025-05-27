
// This file is for diagnostic purposes.

export default function HomePage() {
  return (
    <div style={{ padding: '20px', textAlign: 'center', backgroundColor: 'lightyellow', border: '2px solid orange', margin: '20px' }}>
      <h1>Diagnostic Test Page</h1>
      <p>This content is rendered from <strong>src/app/page.tsx</strong>.</p>
      <p>If you are seeing this, the Next.js App Router and src/app/layout.tsx are functioning at a basic level.</p>
      <p>The previous blank screen meant that either this page returning 'null' didn't cause a fallback to public/index.html, OR public/index.html itself (or its scripts) resulted in a blank page.</p>
    </div>
  );
}
