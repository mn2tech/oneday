export default function Error({ statusCode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', color: '#f0f0f5', fontFamily: 'Inter, sans-serif', textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '3rem', marginBottom: '16px' }}>◆</div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '12px' }}>
        {statusCode ? `${statusCode} — Server Error` : 'Client Error'}
      </h1>
      <p style={{ color: '#8888aa', marginBottom: '32px' }}>
        Something went wrong. Please try again.
      </p>
      <a href="/" style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', padding: '12px 28px', borderRadius: '10px', textDecoration: 'none', fontWeight: 600 }}>
        Back to Home
      </a>
    </div>
  );
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};
