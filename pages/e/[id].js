import { useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';
import styles from '../../styles/EventPage.module.css';

export default function EventPage({ app, error }) {
  useEffect(() => {
    if (app?.id) {
      // Fire-and-forget view count increment
      supabase.rpc('increment_view_count', { app_id: app.id }).catch(() => {});
    }
  }, [app?.id]);

  if (error) {
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

export async function getServerSideProps({ params }) {
  const { id } = params;

  const { data, error } = await supabase
    .from('event_apps')
    .select('id, title, html, is_live, plan, created_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return { props: { app: null, error: true } };
  }

  return {
    props: {
      app: data,
      error: false,
    },
  };
}
