import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { isServedByBoard } from './device/api';
import { store } from './model/store';
import { App } from './ui/App';
import { RemoteApp } from './ui/RemoteApp';
import './styles.css';

type Route = 'editor' | 'remote';

// #/remote and #/editor pick a page explicitly. Without a hash, phones that reach a board get
// the remote; everything else gets the editor.
function route(): Route {
  if (location.hash === '#/remote') return 'remote';
  if (location.hash === '#/editor') return 'editor';
  const phone = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  const board = isServedByBoard() || !!import.meta.env.VITE_DEVICE_PROXY;
  return phone && board ? 'remote' : 'editor';
}

function Root() {
  const [r, setR] = useState<Route>(route);
  useEffect(() => {
    const onHash = () => setR(route());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return r === 'remote' ? <RemoteApp /> : <App />;
}

store.restore().finally(() => render(<Root />, document.getElementById('app')!));
