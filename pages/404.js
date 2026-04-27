import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#f0f0f5', fontFamily: 'Inter, sans-serif', textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '3rem', marginBottom: '16px' }}>◆</div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '12px' }}>404 — Page Not Found</h1>
      <p style={{ color: '#8888aa', marginBottom: '32px' }}>
        This page doesn&apos;t exist or the event link may have expired.
      </p>
      <Link href="/" style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', padding: '12px 28px', borderRadius: '10px', textDecoration: 'none', fontWeight: 600 }}>
        Back to Home
      </Link>
    </div>
  );
}
