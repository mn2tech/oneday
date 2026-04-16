import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../../styles/EventPage.module.css';

export default function EventPage() {
  const router = useRouter();
  const { id } = router.query;
  const [app, setApp] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'found' | 'notfound'

  useEffect(() => {
    if (!id) return;

    fetch(`/api/event/${id}`)
      .then((res) => {
        if (!res.ok) { setStatus('notfound'); return null; }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setApp(data);
        setStatus('found');
      })
      .catch(() => setStatus('notfound'));
  }, [id]);

  if (status === 'loading') {
    return (
      <>
        <Head><title>Loading… — OneDay</title></Head>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
        </div>
      </>
    );
  }

  if (status === 'notfound') {
    return (
      <>
        <Head><title>Event Not Found — OneDay</title></Head>
        <div className={styles.errorContainer}>
          <div className={styles.errorBox}>
            <span className={styles.errorIcon}>404</span>
            <h1>Event Not Found</h1>
            <p>This event link may be invalid or has been removed.</p>
            <a href="/" className={styles.homeLink}>Create your own event</a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{app.title} — OneDay</title>
        <meta name="description" content={`${app.title} — powered by OneDay`} />
        <meta property="og:title" content={app.title} />
        <meta property="og:description" content="View this event on OneDay" />
      </Head>

      <div className={styles.wrapper}>
        {!app.is_live && (
          <div className={styles.draftBanner}>
            This event is not yet published. Only you can see this page.
          </div>
        )}

        <iframe
          className={styles.iframe}
          srcDoc={app.html}
          title={app.title}
          sandbox="allow-scripts allow-same-origin allow-forms"
          loading="lazy"
        />

        <div className={styles.watermark}>
          Made with <a href="/" target="_blank" rel="noopener noreferrer">OneDay</a>
        </div>
      </div>
    </>
  );
}
