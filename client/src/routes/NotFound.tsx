import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { useLocalize } from '~/hooks';

export default function NotFound() {
  const localize = useLocalize();
  const navigate = useNavigate();

  return (
    <main className="bg-surface-primary flex min-h-screen items-center justify-center px-6 py-12">
      <section className="flex max-w-md flex-col items-center text-center">
        <img
          src="/assets/meo-ai-mark.svg"
          alt="Meo AI"
          className="mb-8 h-16 w-16 rounded-2xl"
        />
        <p className="text-text-secondary mb-3 text-sm font-medium tracking-[0.22em]">404</p>
        <h1 className="text-text-primary mb-8 text-3xl font-semibold tracking-tight">Meo AI</h1>
        <Button variant="outline" size="lg" onClick={() => navigate('/c/new')}>
          {localize('com_ui_new_chat')}
        </Button>
      </section>
    </main>
  );
}
