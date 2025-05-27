
// This page will attempt to load public/index.html in an iframe.
export default function HomePage() {
  return (
    <div style={{ margin: 0, padding: 0, overflow: 'hidden', height: '100vh', width: '100vw' }}>
      <iframe
        src="/index.html"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          margin: 0,
          padding: 0,
        }}
        title="LottoLook App"
      />
    </div>
  );
}
