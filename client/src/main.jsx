import './polyfills/storage';
import './polyfills/regeneratorRuntime';
import { createRoot } from 'react-dom/client';
import { initializeI18n } from './locales/i18n';
import App from './App';
import '@librechat/client/style.css';
import './style.css';
import './mobile.css';
import { ApiErrorBoundaryProvider } from './hooks/ApiErrorBoundaryContext';
import 'katex/dist/katex.min.css';
import 'katex/dist/contrib/copy-tex.js';

const MEO_PRODUCT_NAME = 'Meo AI';
const MEO_PRODUCT_DESCRIPTION =
  'Meo AI is the browser companion for the MeoArch assistant, with multi-model chat, tools, synced conversations, and user-controlled providers.';
const MEO_FAVICON = 'assets/meo-ai-mark.svg';

function ensureMeta(property, content, attribute = 'name') {
  let element = document.head.querySelector(`meta[${attribute}="${property}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, property);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function applyFavicon() {
  document.head.querySelectorAll('link[rel="icon"]').forEach((element) => element.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = MEO_FAVICON;
  document.head.appendChild(icon);
}

function applyMeoBrandMetadata() {
  document.title = MEO_PRODUCT_NAME;
  ensureMeta('description', MEO_PRODUCT_DESCRIPTION);
  ensureMeta('application-name', MEO_PRODUCT_NAME);
  ensureMeta('og:title', MEO_PRODUCT_NAME, 'property');
  ensureMeta('og:description', MEO_PRODUCT_DESCRIPTION, 'property');
  ensureMeta('og:type', 'website', 'property');
  ensureMeta('twitter:card', 'summary');
  ensureMeta('twitter:title', MEO_PRODUCT_NAME);
  ensureMeta('twitter:description', MEO_PRODUCT_DESCRIPTION);
  applyFavicon();
}

applyMeoBrandMetadata();

const container = document.getElementById('root');
const root = createRoot(container);

async function bootstrap() {
  await initializeI18n();

  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
}

bootstrap().catch((error) => {
  console.error('[i18n] Failed to initialize before render', error);
  root.render(
    <ApiErrorBoundaryProvider>
      <App />
    </ApiErrorBoundaryProvider>,
  );
});
