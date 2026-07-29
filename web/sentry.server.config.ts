import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://916615111546234df4222da7fdcc0e16@o4510463123849216.ingest.us.sentry.io/4511819103207424",
  tracesSampleRate: 0.1,
  debug: false,
});
